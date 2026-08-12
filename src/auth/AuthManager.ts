/**
 * Authentication Manager
 *
 * Handles the 3-step MCP authentication flow and JWT token management
 */

import axios from 'axios';
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import {
  AUTHENTICATE_TIMEOUT_MS,
  AuthOutcomeUnknownError,
  boundedPost,
  classifyHttpError,
  LOGIN_TIMEOUT_MS,
  TRANSIENT_MESSAGE,
} from '../config/httpPolicy.js';
import { PRODUCTION_API_URL, resolveApiUrl } from '../config/apiUrl.js';
import { tryApplyFileAcl } from './winAcl.js';


/**
 * Repair one credential artifact's protection in place (Fix 3): Unix —
 * chmod 0600 when the mode is wider; Windows — stamp the per-file ACL.
 * Fail-soft; missing files are ignored.
 */
async function repairArtifactMode(filePath: string): Promise<void> {
  try {
    if (process.platform === 'win32') {
      await tryApplyFileAcl(filePath);
      return;
    }
    const stats = await fs.stat(filePath);
    if ((stats.mode & 0o177) !== 0) {
      await fs.chmod(filePath, 0o600);
      logger.debug('Repaired credential artifact mode to 0600', { file: filePath });
    }
  } catch {
    /* missing file or best-effort failure — never block auth */
  }
}

/**
 * Startup repair sweep (Fix 3, B5-audit): every known credential
 * artifact — including stale/renamed leftovers like
 * `credentials.json.prod-cache` — is re-tightened in both the current
 * cache dir and the legacy `<cwd>/.auth-cache` location. Runs BEFORE any
 * early return (keychain path included).
 */
async function repairAllArtifactModes(currentCacheDir: string): Promise<void> {
  const dirs = [currentCacheDir, path.join(process.cwd(), '.auth-cache')];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue; // dir absent
    }
    for (const name of entries) {
      const isArtifact =
        name.startsWith('credentials.json') ||
        name === '.salt' ||
        name === 'device-id' ||
        name === 'auth-outcome-unknown.json';
      if (isArtifact) {
        await repairArtifactMode(path.join(dir, name));
      }
    }
  }
}

/**
 * Harden directory permissions cross-platform after creation.
 *
 * Review M1 + M4: UNIX chmods immediately after mkdir (closes the umask
 * window). Windows removes ACL inheritance and grants only the owning
 * user (by SID) plus SYSTEM and Administrators — see winAcl.ts.
 */
async function hardenDirectoryPerms(dir: string): Promise<void> {
  if (process.platform === 'win32') {
    // Hardening 0.5.1 (Fix 3, B7): SID-based grants via execFile argv —
    // no shell interpolation, no localized account names, and SYSTEM /
    // Administrators retained alongside the owning user. Fail-soft
    // inside tryApplyFileAcl.
    await tryApplyFileAcl(dir, { container: true });
  } else {
    try {
      await fs.chmod(dir, 0o700);
    } catch (err: any) {
      logger.warn('hardenDirectoryPerms: chmod failed', { dir, error: err?.message });
    }
  }
}

/**
 * Atomically write a sensitive file with strict perms.
 *
 * Review M1: `fs.writeFile(path, content, {mode})` creates the file with
 * the given mode subject to umask, opening a window where the file is
 * world-readable until our subsequent chmod closes it. Use the `wx` flag
 * (O_CREAT | O_EXCL) after explicit unlink so the create is atomic and
 * the immediate chmod cannot race with another process opening the
 * still-loose file.
 *
 * On Windows, where chmod is meaningless, the directory's ACL (set via
 * `hardenDirectoryPerms`) is the actual access control — `mode` is
 * advisory and chmod is a no-op.
 */
async function secureWriteFile(filePath: string, content: string | Buffer): Promise<void> {
  // Pre-unlink so 'wx' (O_CREAT | O_EXCL) succeeds even if the file
  // already exists. Failures here are tolerated — most likely ENOENT.
  try {
    await fs.unlink(filePath);
  } catch {
    /* not present */
  }
  await fs.writeFile(filePath, content, { mode: 0o600, flag: 'wx' });
  if (process.platform !== 'win32') {
    try {
      await fs.chmod(filePath, 0o600);
    } catch {
      /* best-effort */
    }
  } else {
    // Hardening 0.5.1 (Fix 3): per-file ACL stamp — mode bits are
    // no-ops on Windows; the file gets its own restrictive ACL rather
    // than relying on directory inheritance alone.
    await tryApplyFileAcl(filePath);
  }
}

/**
 * Resolve the per-user cache directory for credentials.
 * - Windows: %APPDATA%\jaumemory-mcp (with sane fallback if APPDATA unset)
 * - Linux/macOS: ~/.config/jaumemory-mcp
 */
function resolveCacheDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
      || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'jaumemory-mcp');
  }
  return path.join(os.homedir(), '.config', 'jaumemory-mcp');
}

/** Approximate process start time (ms since epoch). */
const PROCESS_START_MS = Date.now() - (process.uptime() * 1000);

// AES-256-GCM constants
const GCM_NONCE_LEN = 12;
const GCM_TAG_LEN = 16;

interface AuthCredentials {
  requestId: string;
  authToken: string;
  userId: string;
  jwtToken: string;
  jwtExpiry: number;
  refreshToken?: string;
  syncId: string;
  /**
   * Client-generated UUID identifying this device/install. Generated
   * once at first auth via `getOrCreateDeviceId()` and persisted to
   * a SEPARATE keyring entry so it survives logout and credential
   * wipes. Per-device session binding requires this to be sent on
   * every authenticate + refresh call.
   */
  deviceId?: string;
  /**
   * Session-bound refresh secret. Returned by the server on
   * authenticate (only when device_id was sent). Rotates on every
   * refresh. Presenting it (plus the current JWT and matching
   * device_id) is what proves we own the session on the
   * /v1/auth/mcp/refresh endpoint — no need to re-send the
   * long-lived auth_token.
   */
  refreshSecret?: string;
  /**
   * Server-side `mcp_sessions.id` for this session. Used by the
   * scoped logout call so the server can revoke this specific
   * session row (scope=this) without resolving via JWT hash.
   */
  sessionId?: string;
  /**
   * API origin that issued these credentials (hardening 0.5.1, Fix 2).
   * Tokens are sent ONLY to this origin; a resolved-URL mismatch is a
   * refusal, never a redirect. Absent only in pre-0.5.1 caches — see
   * the migration stamping in loadCachedCredentials.
   */
  origin?: string;
}

interface McpLoginResponse {
  request_id: string;
  approval_url: string;
  expires_at: string;
}

interface CheckLoginResponse {
  approved: boolean;
  encrypted_auth_token?: string; // For dual verification
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  /** v0.5.0+: session id for scoped logout. */
  session_id?: string;
  /** v0.5.0+: session-bound refresh secret. Stored in keyring. */
  refresh_secret?: string;
}

interface RefreshResponse {
  access_token: string;
  refresh_secret: string;
  expires_in: number;
}

/**
 * 8th-audit Finding 2: mirror the server-side device_id validator
 * exactly so a corrupted keyring/file value is caught before it
 * reaches the wire, and so `getOrCreateDeviceId()` can self-heal
 * by regenerating instead of busy-looping on `invalid_device_id`.
 *
 * Server validator (Rust):
 *   `c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-')`
 *   `1..=64` chars
 *
 * Keep these two definitions in lockstep. If the Rust class ever
 * changes, update this regex in the same commit.
 */
const SAFE_DEVICE_ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
function isSafeDeviceId(s: string): boolean {
  return SAFE_DEVICE_ID_RE.test(s);
}

export class AuthManager {
  private apiUrl: string;
  private credentials?: AuthCredentials;
  private cacheFile: string;

  /** Once-per-process guard for the env-flow deprecation warning. */
  private static envFlowDeprecationWarned = false;

  /**
   * Pending-auth origin map (Fix 2, C2): request_id → origin recorded at
   * mcp_login, consumed by mcp_authenticate. IN-MEMORY only — no
   * persisted artifact; a process restart between login and authenticate
   * forces a fresh mcp_login. Entries expire after the approval window
   * plus margin and are deleted on authenticate success or failure.
   */
  private pendingOrigins = new Map<string, { origin: string; expiresAt: number }>();
  private static readonly PENDING_ORIGIN_TTL_MS = 6 * 60_000;

  private prunePendingOrigins(): void {
    const now = Date.now();
    for (const [id, entry] of this.pendingOrigins) {
      if (entry.expiresAt <= now) this.pendingOrigins.delete(id);
    }
  }

  /**
   * @param cacheDirOverride test seam only — production callers pass
   * nothing and get the per-user cache dir from resolveCacheDir().
   */
  constructor(cacheDirOverride?: string) {
    // Hardening 0.5.1 (Fix 2): single validated resolver — https:
    // required except loopback dev; the only JAUMEMORY_API_URL read
    // site is the resolver module.
    this.apiUrl = resolveApiUrl();

    // A11: cache lives in user home, not cwd. Per-user, persistent across cwd changes.
    this.cacheFile = path.join(cacheDirOverride ?? resolveCacheDir(), 'credentials.json');

    // Log configuration (without sensitive data)
    logger.debug('AuthManager initialized', {
      apiUrl: this.apiUrl,
      environment: process.env.NODE_ENV || 'development'
    });
  }

  async initialize(): Promise<void> {
    // A11: migrate legacy <cwd>/.auth-cache/credentials.json (+ .salt sibling)
    // to the new user-home location if the new location does not yet exist.
    await this.migrateLegacyCacheIfNeeded();

    // Try to load cached credentials
    await this.loadCachedCredentials();

    // Don't require authentication on startup
    // Authentication will happen when user calls login tool
  }

  /**
   * A11 migration: if a legacy cache exists in `<cwd>/.auth-cache/` and the new
   * user-home location does not, move both `credentials.json` and the `.salt`
   * sibling. Best-effort — failures are logged and ignored (we'll fall through
   * to first-run auth, same as if no cache existed).
   */
  private async migrateLegacyCacheIfNeeded(): Promise<void> {
    const legacyDir = path.join(process.cwd(), '.auth-cache');
    const legacyCache = path.join(legacyDir, 'credentials.json');
    const legacySalt = path.join(legacyDir, '.salt');
    const newDir = path.dirname(this.cacheFile);
    const newCache = this.cacheFile;
    const newSalt = path.join(newDir, '.salt');

    let legacyCacheExists = false;
    try {
      await fs.access(legacyCache);
      legacyCacheExists = true;
    } catch {
      // No legacy cache — nothing to migrate.
      return;
    }

    let newCacheExists = false;
    try {
      await fs.access(newCache);
      newCacheExists = true;
    } catch {
      // New cache absent — proceed with migration.
    }

    if (!legacyCacheExists || newCacheExists) {
      return;
    }

    try {
      await fs.mkdir(newDir, { recursive: true, mode: 0o700 });
      // Review M1 + M4: harden cross-platform.
      await hardenDirectoryPerms(newDir);

      await fs.rename(legacyCache, newCache);
      // Hardening 0.5.1 (Fix 3, B5-audit): rename preserves the legacy
      // file's (possibly wide) mode — repair it explicitly.
      await repairArtifactMode(newCache);

      // Move salt sibling if present. The pre-seeded-salt guard in
      // getOrCreateEncryptionKey() requires a cache file to coexist before
      // it trusts an old-mtime salt, so the migrated salt is fine as-is
      // (cache + salt land together).
      try {
        await fs.access(legacySalt);
        await fs.rename(legacySalt, newSalt);
        await repairArtifactMode(newSalt);
      } catch {
        // No legacy salt — fine; we'll regenerate one if needed.
      }

      // Clean up empty legacy dir (best-effort).
      try { await fs.rmdir(legacyDir); } catch { /* may have other files */ }

      logger.warn('migrated cache from legacy <cwd>/.auth-cache to user home', {
        from: legacyCache,
        to: newCache
      });
    } catch (error) {
      logger.warn('Legacy cache migration failed; proceeding without it', { error });
    }
  }

  async getUserId(): Promise<string | null> {
    return this.credentials?.userId || null;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.credentials) {
      throw new Error('Not authenticated');
    }

    // Check if token needs refresh
    if (this.isTokenExpired()) {
      await this.refreshToken();
    }

    return {
      'authorization': `Bearer ${this.credentials.jwtToken}`,
      'x-sync-id': this.credentials.syncId,
      'x-user-id': this.credentials.userId
    };
  }

  async authenticate(): Promise<void> {
    // Check if we have cached credentials from previous session
    const requestId = process.env.JAUMEMORY_REQUEST_ID;
    const authToken = process.env.JAUMEMORY_AUTH_TOKEN;

    if (requestId && authToken) {
      try {
        // Deprecated env path (removal 0.6.0): authenticateWithToken now
        // requires a pending-origin entry (Fix 2, B3); env-provided ids
        // never went through login in this process, so bind them to the
        // resolved origin here to preserve the flow's behavior.
        this.prunePendingOrigins();
        this.pendingOrigins.set(requestId, {
          origin: this.apiUrl,
          expiresAt: Date.now() + AuthManager.PENDING_ORIGIN_TTL_MS,
        });
        await this.authenticateWithToken(requestId, authToken);
        return;
      } catch (error) {
        logger.warn('Cached authentication failed, starting new flow');
      }
    }

    // Otherwise, perform initial authentication
    await this.performMcpLogin();
  }

  private async promptForCredentials(): Promise<{ username: string; email: string }> {
    // Check if credentials are provided via environment (for CI/CD)
    if (process.env.JAUMEMORY_USERNAME && process.env.JAUMEMORY_EMAIL) {
      return {
        username: process.env.JAUMEMORY_USERNAME,
        email: process.env.JAUMEMORY_EMAIL
      };
    }

    // In MCP context, we need to throw an error with instructions
    throw new Error(
      '\n\n=== MCP AUTHENTICATION REQUIRED ===\n' +
      'Please set the following environment variables:\n' +
      '  JAUMEMORY_USERNAME=your_username\n' +
      '  JAUMEMORY_EMAIL=your_email@example.com\n' +
      '\nThen restart the MCP server to begin authentication.\n' +
      'These are only used to generate the approval link, not for login.\n'
    );
  }

  private async performMcpLogin(): Promise<void> {
    // Hardening 0.5.1: the env-driven login flow (including its approval
    // polling loop) is deprecated. Supported flow: the mcp_login /
    // mcp_authenticate tools. Scheduled for removal in 0.6.0.
    if (!AuthManager.envFlowDeprecationWarned) {
      AuthManager.envFlowDeprecationWarned = true;
      logger.warn(
        'DEPRECATED: environment-driven login (JAUMEMORY_USERNAME/EMAIL) ' +
          'will be removed in 0.6.0. Use the mcp_login and ' +
          'mcp_authenticate tools instead.',
      );
    }
    // Check API URL is set
    if (!this.apiUrl) {
      throw new Error('JAUMEMORY_API_URL environment variable is required. Please set it to your JauMemory API endpoint.');
    }

    logger.info('Starting MCP authentication flow...');

    // Get username and email from user
    const { username, email } = await this.promptForCredentials();

    logger.info(`Authenticating as: ${username} (${email})`);

    // Step 1: Initiate login with hash (no username/email sent)
    const dateNonce = new Date().toISOString();
    const connectionName = `${process.env.MCP_SERVER_NAME || 'JauMemory'} MCP Server`;

    // Generate request hash from user credentials
    const hash = createHash('sha512');
    hash.update(`${username}:${email}:${dateNonce}:${connectionName}`);
    const requestHash = hash.digest('hex');

    let request_id: string;
    let approval_url: string;

    try {
      const loginResponse = await axios.post<McpLoginResponse>(
        `${this.apiUrl}/v1/auth/mcp/login`,
        {
          date_nonce: dateNonce,
          connection_name: connectionName,
          request_hash: requestHash
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      request_id = loginResponse.data.request_id;
      approval_url = loginResponse.data.approval_url;

      // Fix 2 (B3): the deprecated env flow shares authenticateWithToken,
      // which requires a pending-origin entry.
      this.prunePendingOrigins();
      this.pendingOrigins.set(request_id, {
        origin: this.apiUrl,
        expiresAt: Date.now() + AuthManager.PENDING_ORIGIN_TTL_MS,
      });

      logger.info('MCP login initiated. Please approve the connection:');
      logger.info(`Approval URL: ${approval_url}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('Failed to initiate MCP login:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        throw new Error(`MCP login failed: ${error.response?.data?.detail || error.message}`);
      }
      throw error;
    }

    // Derive request key for decryption
    const requestKey = this.deriveRequestKey(username, email, connectionName, dateNonce);

    // Step 2: Poll for approval
    let approved = false;
    let encryptedAuthToken: string | undefined;
    const maxAttempts = 60; // 5 minutes with 5-second intervals

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      try {
        const checkResponse = await axios.post<CheckLoginResponse>(
          `${this.apiUrl}/v1/auth/mcp/check`,
          {
            request_id
          }
        );

        if (checkResponse.data.approved && checkResponse.data.encrypted_auth_token) {
          approved = true;
          encryptedAuthToken = checkResponse.data.encrypted_auth_token;
          break;
        }
      } catch (error) {
        // Continue polling
      }

      if (i % 12 === 0 && i > 0) { // Every minute
        logger.info('Still waiting for approval...');
      }
    }

    if (!approved || !encryptedAuthToken) {
      throw new Error('MCP authentication timed out or was not approved');
    }

    logger.info('MCP connection approved!');

    // Decrypt the auth token received from server
    const decryptedAuthToken = this.decryptAuthToken(encryptedAuthToken, requestKey);
    logger.debug('Decrypted auth token from server');

    // Prompt user for the auth token they copied from web UI
    logger.info('\n=== DUAL VERIFICATION REQUIRED ===');
    logger.info('Please enter the authentication code shown in your web browser:');
    logger.info('(This is an additional security measure to protect your memories)\n');

    const userProvidedToken = await this.promptForAuthToken();

    // Verify both tokens match
    if (decryptedAuthToken !== userProvidedToken) {
      throw new Error('Authentication tokens do not match. Security verification failed.');
    }

    logger.info('Security verification successful!');

    // Step 3: Authenticate with request_id and auth_token
    await this.authenticateWithToken(request_id, userProvidedToken);

    logger.info('Authentication successful. Credentials cached locally.');
  }

  /**
   * Diagnostic marker for an ambiguous authenticate outcome (Fix 1, C2):
   * written beside the cache, fail-soft, no secret material — request_id
   * and timestamp only.
   */
  private async writeOutcomeUnknownMarker(requestId: string): Promise<void> {
    try {
      const cacheDir = path.dirname(this.cacheFile);
      // Fresh install: the cache dir may not exist yet if authenticate
      // failed before any successful credential save.
      await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
      await hardenDirectoryPerms(cacheDir);
      const markerPath = path.join(cacheDir, 'auth-outcome-unknown.json');
      await secureWriteFile(
        markerPath,
        JSON.stringify({ request_id: requestId, at: new Date().toISOString() }),
      );
    } catch (err) {
      logger.debug('Could not write outcome-unknown marker', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async authenticateWithToken(requestId: string, authToken: string): Promise<void> {
    // Fix 2 (B3): the auth code goes ONLY to the origin the login was
    // initiated against. Missing entry = expired/restarted; changed env
    // between login and authenticate = refusal, never a redirect.
    this.prunePendingOrigins();
    const pending = this.pendingOrigins.get(requestId);
    if (!pending) {
      throw new Error(
        'No pending login for this request_id (expired, or the MCP server ' +
          'restarted since mcp_login). Run mcp_login again.',
      );
    }
    if (pending.origin !== this.apiUrl) {
      throw new Error(
        `This login was initiated against ${pending.origin}, but the ` +
          `configured API URL is now ${this.apiUrl}. Refusing to send the ` +
          'auth code to a different origin; run mcp_login again.',
      );
    }
    const authOrigin = pending.origin;

    // Generate sync_id: SHA-256(request_id + auth_token)
    const syncId = createHash('sha256');
    syncId.update(requestId);
    syncId.update(authToken);
    const syncIdHex = syncId.digest('hex');

    // v0.5.0+: send device_id so the server can populate
    // mcp_sessions.device_id and return a refresh_secret. Old servers
    // (pre-V090 migration) safely ignore the extra field.
    const deviceId = await this.getOrCreateDeviceId();

    logger.debug('Authenticating with sync_id approach');

    try {
      const authResponse = await boundedPost<AuthResponse>(
        `${authOrigin}/v1/auth/mcp/authenticate`,
        {
          sync_id: syncIdHex,
          device_id: deviceId,
        },
        {
          // Hardening 0.5.1 (Fix 1): bounded, with distinct
          // unknown-outcome handling below — the server commits the
          // session BEFORE returning the JWT.
          timeout: AUTHENTICATE_TIMEOUT_MS,
        }
      );

      const { access_token, expires_in, user_id, session_id, refresh_secret } = authResponse.data;

      this.credentials = {
        requestId,
        authToken,
        userId: user_id,
        jwtToken: access_token,
        jwtExpiry: Date.now() + (expires_in * 1000),
        syncId: syncIdHex,
        deviceId,
        // refresh_secret only present on v0.5.0+ servers; older
        // servers omit it and we fall back to legacy broken-refresh
        // (forced re-login hourly) — same UX as today.
        refreshSecret: refresh_secret,
        sessionId: session_id,
        // Fix 2: bind these credentials to the origin that issued them.
        origin: authOrigin,
      };

      await this.saveCachedCredentials();
    } catch (error) {
      // Hardening 0.5.1 (Fix 1, plan B8/C1): a timeout or network
      // failure WITHOUT a response, after the request may have been
      // sent, is an UNKNOWN outcome — the backend consumes the pending
      // row and commits the session before returning, so a live session
      // may exist that we never received. Distinct error class; not
      // "transient"; a retry cannot succeed (the pending row is
      // consumed).
      if (axios.isAxiosError(error) && error.response === undefined) {
        await this.writeOutcomeUnknownMarker(requestId);
        throw new AuthOutcomeUnknownError(requestId);
      }
      if (axios.isAxiosError(error)) {
        logger.error('Authentication failed:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });

        // Better error extraction
        let errorMessage = 'Unknown error';
        if (error.response?.data) {
          if (typeof error.response.data === 'string') {
            errorMessage = error.response.data;
          } else if (error.response.data.detail) {
            errorMessage = error.response.data.detail;
          } else if (error.response.data.error) {
            errorMessage = error.response.data.error;
          } else if (error.response.data.message) {
            errorMessage = error.response.data.message;
          } else {
            // Try to stringify, but handle circular references
            try {
              errorMessage = JSON.stringify(error.response.data);
            } catch (e) {
              errorMessage = 'Authentication failed (serialization error)';
            }
          }
        } else if (error.message) {
          errorMessage = error.message;
        }

        // Create a clean error without any circular references or non-serializable properties
        const cleanError = new Error(`Authentication failed: ${errorMessage}`);
        // Don't attach the original error object to avoid circular references
        throw cleanError;
      }
      // Handle non-axios errors
      if (error instanceof Error) {
        throw error;
      } else if (typeof error === 'string') {
        throw new Error(`Authentication failed: ${error}`);
      } else {
        // Unknown error type - try to extract message
        let msg = 'Authentication failed';
        try {
          if (error && typeof error === 'object' && 'message' in error) {
            msg = String(error.message);
          } else {
            msg = String(error);
          }
        } catch (e) {
          // Can't convert to string
        }
        throw new Error(msg);
      }
    } finally {
      // Fix 2 (C2): a pending entry is single-use — deleted on success,
      // terminal failure, and unknown outcome alike (the server-side
      // pending row is consumed either way; a re-attempt needs a fresh
      // mcp_login).
      this.pendingOrigins.delete(requestId);
    }
  }

  // Public method for login tool
  async login(username: string, email: string): Promise<{ requestId: string; approvalUrl: string }> {
    // Check API URL is set
    if (!this.apiUrl) {
      throw new Error('JAUMEMORY_API_URL environment variable is required. Please set it to your JauMemory API endpoint.');
    }

    logger.info('Starting MCP authentication flow...');
    logger.info(`Authenticating as: ${username} (${email})`);

    // Step 1: Initiate login with hash (no username/email sent)
    const dateNonce = new Date().toISOString();
    const connectionName = `${process.env.MCP_SERVER_NAME || 'JauMemory'} MCP Server`;

    // Generate request hash from user credentials
    const hash = createHash('sha512');
    hash.update(`${username}:${email}:${dateNonce}:${connectionName}`);
    const requestHash = hash.digest('hex');

    try {
      const loginResponse = await boundedPost<McpLoginResponse>(
        `${this.apiUrl}/v1/auth/mcp/login`,
        {
          date_nonce: dateNonce,
          connection_name: connectionName,
          request_hash: requestHash
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          // Hardening 0.5.1 (Fix 1): login returns request_id/approval_url
          // immediately; the human approval wait happens out-of-band.
          timeout: LOGIN_TIMEOUT_MS
        }
      );

      // Fix 2 (B3): bind this pending approval to the origin it was
      // initiated against; mcp_authenticate refuses any other origin.
      this.prunePendingOrigins();
      this.pendingOrigins.set(loginResponse.data.request_id, {
        origin: this.apiUrl,
        expiresAt: Date.now() + AuthManager.PENDING_ORIGIN_TTL_MS,
      });

      return {
        requestId: loginResponse.data.request_id,
        approvalUrl: loginResponse.data.approval_url
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('Failed to initiate MCP login:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        // Hardening 0.5.1 (Fix 1, B5): retryable failures surface as
        // clearly transient; terminal statuses keep the server detail.
        if (classifyHttpError(error) === 'retryable') {
          throw new Error(`MCP login failed: ${TRANSIENT_MESSAGE}`);
        }
        throw new Error(`MCP login failed: ${error.response?.data?.detail || error.message}`);
      }
      throw error;
    }
  }

  // Public method for authenticate tool
  async completeAuthentication(requestId: string, authToken: string): Promise<void> {
    await this.authenticateWithToken(requestId, authToken);
  }

  /**
   * In-flight refresh promise. Used to coalesce concurrent callers
   * onto a single backend round-trip. Without this, two simultaneous
   * `getAuthHeaders()` calls (e.g. two parallel gRPC requests both
   * proactively refreshing right at the 5-min-before-expiry boundary)
   * would each independently POST to /v1/auth/mcp/refresh — the
   * second would fail because the server's refresh_secret_hash and
   * jwt_token_hash have already rotated.
   *
   * The mutex only coalesces WITHIN-process callers. Cross-process
   * races (two separate Node processes sharing the same keyring
   * credentials) can still occur; the loser gets 401 unknown_session
   * and falls back to fresh login. Documented + acceptable for v1.
   */
  private refreshPromise: Promise<void> | null = null;

  async refreshToken(): Promise<void> {
    // Coalesce concurrent in-process callers onto one refresh.
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  /**
   * Actual refresh implementation. Wrapped in `refreshPromise` mutex
   * by the public `refreshToken()`.
   *
   * Calls the new POST /v1/auth/mcp/refresh endpoint (v0.5.0+).
   * Presents refresh_secret + device_id + the (possibly expired) JWT
   * — the server verifies the trio against the session row and
   * rotates both jwt_token_hash and refresh_secret_hash in lockstep
   * if they match.
   *
   * Terminal-error categories trigger an immediate `clearSession()`
   * because there is no longer any way to refresh; the user must
   * fresh-login. Transient errors (network, 5xx) bubble up so the
   * caller can retry on the next request.
   */
  private async doRefresh(): Promise<void> {
    if (!this.credentials) {
      throw new Error('No credentials to refresh');
    }

    // Legacy credentials: pre-v0.5.0 install / upgrade-without-fresh-
    // login. The new endpoint can't accept us; force fresh login.
    if (!this.credentials.deviceId || !this.credentials.refreshSecret) {
      logger.warn('Credentials predate v0.5.0 (no deviceId / refreshSecret); clearing for fresh login');
      await this.clearSession();
      throw new Error('Credentials predate v0.5.0. Please re-authenticate.');
    }

    // Fix 2: refresh presents the refresh secret + JWT — they go ONLY to
    // the origin that issued them. Mismatch = refusal (no clearSession:
    // the credentials remain valid for their own origin).
    if (this.credentials.origin && this.credentials.origin !== this.apiUrl) {
      throw new Error(
        `Credentials belong to ${this.credentials.origin}, but the ` +
          `configured API URL is ${this.apiUrl}. Refusing to refresh; ` +
          're-login against the configured URL.',
      );
    }

    logger.debug('Refreshing JWT via /v1/auth/mcp/refresh');

    try {
      const response = await boundedPost<RefreshResponse>(
        `${this.apiUrl}/v1/auth/mcp/refresh`,
        {
          refresh_secret: this.credentials.refreshSecret,
          device_id:      this.credentials.deviceId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.credentials.jwtToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        }
      );

      const { access_token, refresh_secret, expires_in } = response.data;
      this.credentials.jwtToken      = access_token;
      this.credentials.refreshSecret = refresh_secret;
      this.credentials.jwtExpiry     = Date.now() + (expires_in * 1000);
      await this.saveCachedCredentials();
      logger.debug('JWT + refresh_secret rotated silently');

    } catch (error) {
      // Terminal vs transient categorization. Codes match the
      // structured errors the Rust handler at
      // src/features/security/mcp_auth.rs::mcp_refresh returns.
      if (axios.isAxiosError(error) && error.response) {
        const code = (error.response.data as { error?: string } | undefined)?.error;
        const TERMINAL = new Set<string>([
          'approval_expired',         // 410 — user's window genuinely past
          'device_binding_required',  // 412 — legacy row, must fresh-login
          'device_mismatch',          // 401 — keyring tampered or wrong machine
          'invalid_device_id',        // 400 — stored device_id was corrupted or
                                      //       doesn't match the server validator's
                                      //       [A-Za-z0-9._:-]{1,64} class.
                                      //       Without this entry, the client would
                                      //       treat 400 as transient and busy-loop.
          'session_revoked',          // 401 — admin force-logout
          'invalid_refresh_secret',   // 401 — secret rotated by another process
          'invalid_signature',        // 401 — JWT secret rotated server-side
          'unknown_session',          // 401 — multi-process loser, stale token
          'missing_bearer',           // 401 — programmer error here, but treat as terminal
        ]);
        if (code && TERMINAL.has(code)) {
          logger.warn(`Refresh terminal error (${code}); clearing session for fresh login`);
          await this.clearSession();
          throw new Error(`Session ended (${code}). Please re-authenticate.`);
        }
      }
      // Transient (network, 5xx): caller retries on the next request.
      logger.error('Refresh failed transiently', error);
      throw new Error('Token refresh failed; will retry.');
    }
  }

  private isTokenExpired(): boolean {
    if (!this.credentials) return true;

    // Refresh 5 minutes before expiry
    const bufferTime = 5 * 60 * 1000;
    return Date.now() >= (this.credentials.jwtExpiry - bufferTime);
  }


  private deriveRequestKey(username: string, email: string, connectionName: string, dateNonce: string): Buffer {
    const hash = createHash('sha512');
    hash.update(username);
    hash.update(':');
    hash.update(email);
    hash.update(':');
    hash.update(connectionName);
    hash.update(':');
    hash.update(dateNonce);
    const fullHash = hash.digest();
    // Take first 32 bytes for AES-256 key
    return fullHash.slice(0, 32);
  }

  private decryptAuthToken(encryptedToken: string, key: Buffer): string {
    // Decode from base64
    const encryptedData = Buffer.from(encryptedToken, 'base64');

    // Extract nonce (first 12 bytes) and ciphertext with auth tag
    const nonce = encryptedData.slice(0, 12);
    const ciphertext = encryptedData.slice(12, -16);
    const authTag = encryptedData.slice(-16);

    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  /**
   * Get encryption key derived from machine-specific data using proper KDF.
   * Uses PBKDF2 (100k iter, SHA-256) with persistent salt.
   *
   * A11 hardening:
   *  - Parent dir is 0o700; salt file is 0o600 (UNIX).
   *  - Regenerate the salt if the on-disk salt file is looser than 0o600.
   *  - Pre-seeded-cache defense: if a salt file exists but no cache file
   *    accompanies it AND the salt's mtime predates this process start, the
   *    salt was almost certainly planted (no legitimate code path leaves a
   *    salt around without a cache, and a freshly-launched process should
   *    not inherit a cwd-untouched salt on a clean install). Regenerate.
   *    Once a legitimate cache exists, the salt is implicitly trusted across
   *    process restarts.
   *
   * Returns the raw 32-byte key (used directly with AES-256-GCM).
   */
  private async getOrCreateEncryptionKey(): Promise<Buffer> {
    const cacheDir = path.dirname(this.cacheFile);
    const saltFile = path.join(cacheDir, '.salt');
    let salt: Buffer | undefined;

    // Ensure parent dir exists with restrictive perms (review M1 + M4:
    // hardens against umask leak on UNIX and inherited-ACL leak on Windows).
    await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
    await hardenDirectoryPerms(cacheDir);

    let cacheFileExists = false;
    try {
      await fs.access(this.cacheFile);
      cacheFileExists = true;
    } catch {
      // No cache file — fine.
    }

    try {
      const stats = await fs.stat(saltFile);

      let regenerate = false;

      if (process.platform !== 'win32') {
        // Mode bits: anything looser than 0o600 (group/other read or write,
        // or owner-execute set) is a red flag.
        const perms = stats.mode & 0o777;
        if ((perms & 0o077) !== 0) {
          logger.warn('Salt file permissions looser than 0o600; regenerating', {
            perms: perms.toString(8),
          });
          regenerate = true;
        }
      }

      // Pre-seeded check: salt exists with no accompanying cache AND its
      // mtime predates this process start → likely planted before launch.
      if (!cacheFileExists && stats.mtimeMs < PROCESS_START_MS) {
        logger.warn('Salt file present without cache and predates process; regenerating', {
          mtime: stats.mtimeMs,
          processStart: PROCESS_START_MS,
        });
        regenerate = true;
      }

      if (!regenerate) {
        const saltHex = await fs.readFile(saltFile, 'utf-8');
        salt = Buffer.from(saltHex.trim(), 'hex');
        if (salt.length !== 32) {
          logger.warn('Salt file content malformed; regenerating');
          salt = undefined;
        }
      }
    } catch {
      // No salt file yet — fall through to generation.
    }

    if (!salt) {
      salt = randomBytes(32);
      await secureWriteFile(saltFile, salt.toString('hex'));
      logger.debug('Generated new encryption salt');
    }

    // Create machine-specific identifier
    const machineId = `${os.hostname()}-${os.userInfo().username}-${process.platform}`;

    // PBKDF2: 100k iterations, SHA-256, 32-byte output. Used directly as the
    // AES-256-GCM key.
    return pbkdf2Sync(machineId, salt, 100000, 32, 'sha256');
  }

  /**
   * AES-256-GCM encrypt: returns base64(nonce(12) || ciphertext || authTag(16)).
   * Key MUST be 32 bytes.
   */
  private encryptCacheBlob(plaintext: string, key: Buffer): string {
    if (key.length !== 32) {
      throw new Error(`encryptCacheBlob: key must be 32 bytes, got ${key.length}`);
    }
    const nonce = randomBytes(GCM_NONCE_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([nonce, ciphertext, authTag]).toString('base64');
  }

  /**
   * AES-256-GCM decrypt of base64(nonce(12) || ciphertext || authTag(16)).
   * Returns null if the input does not match the expected GCM format
   * (legacy CryptoJS-OpenSSL "Salted__" envelopes will land here and produce
   * null — the caller deletes the cache and forces re-auth).
   */
  private decryptCacheBlob(blob: string, key: Buffer): string | null {
    let raw: Buffer;
    try {
      raw = Buffer.from(blob, 'base64');
    } catch {
      return null;
    }
    if (raw.length < GCM_NONCE_LEN + GCM_TAG_LEN + 1) {
      return null;
    }
    const nonce = raw.subarray(0, GCM_NONCE_LEN);
    const authTag = raw.subarray(raw.length - GCM_TAG_LEN);
    const ciphertext = raw.subarray(GCM_NONCE_LEN, raw.length - GCM_TAG_LEN);
    if (nonce.length !== GCM_NONCE_LEN || authTag.length !== GCM_TAG_LEN) {
      return null;
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(authTag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plain.toString('utf8');
    } catch {
      return null;
    }
  }

  /**
   * Delete the cache + salt files (best-effort). Used when we detect a legacy
   * CryptoJS-format cache and want a clean slate before forcing re-auth.
   */
  private async deleteCacheAndSalt(): Promise<void> {
    const saltFile = path.join(path.dirname(this.cacheFile), '.salt');
    try { await fs.unlink(this.cacheFile); } catch { /* may not exist */ }
    try { await fs.unlink(saltFile); } catch { /* may not exist */ }
  }

  /**
   * Try to use the OS keychain (via @napi-rs/keyring) if available,
   * otherwise fall back to the encrypted file at this.cacheFile.
   */
  /**
   * Origin policy for credentials loaded from any cache source (Fix 2,
   * B4/C3). Origin-stamped credentials must match the resolved URL —
   * mismatch is a refusal (credentials dropped from memory; the cache
   * itself is left intact for the origin it belongs to). Pre-0.5.1
   * caches (no origin): stamped as production ONLY when the resolved URL
   * IS the production default (accepted residual risk, plan C3); any
   * override URL requires a fresh login.
   */
  private applyOriginPolicyAfterLoad(): void {
    if (!this.credentials) return;
    const origin = this.credentials.origin;
    if (origin) {
      if (origin !== this.apiUrl) {
        logger.warn(
          `Cached credentials belong to ${origin}, but the configured API ` +
            `URL is ${this.apiUrl}. Refusing to use them; re-login against ` +
            'the configured URL.',
        );
        this.credentials = undefined;
      }
      return;
    }
    if (this.apiUrl === PRODUCTION_API_URL) {
      this.credentials.origin = PRODUCTION_API_URL;
      logger.debug('Stamped pre-0.5.1 cached credentials with the production origin');
      return;
    }
    logger.warn(
      'Existing credentials predate origin-binding and the configured API ' +
        `URL (${this.apiUrl}) is not the production default. Re-login required.`,
    );
    this.credentials = undefined;
  }

  private async loadCachedCredentials(): Promise<void> {
    // Hardening 0.5.1 (Fix 3, B5-audit): repair artifact protection
    // BEFORE any early return — a too-wide cache file must be tightened
    // even when credentials load from the keychain.
    await repairAllArtifactModes(path.dirname(this.cacheFile));

    // Try OS keychain first (if available)
    const keychainLoaded = await this.tryLoadFromKeychain();
    if (keychainLoaded) {
      logger.debug('Loaded credentials from OS keychain');
      this.applyOriginPolicyAfterLoad();
      return;
    }

    // Fall back to encrypted file
    let encryptedData: string;
    try {
      encryptedData = await fs.readFile(this.cacheFile, 'utf-8');
    } catch {
      logger.debug('No cached credentials found');
      return;
    }

    let encryptionKey: Buffer;
    try {
      encryptionKey = await this.getOrCreateEncryptionKey();
    } catch (error) {
      logger.warn('Failed to derive encryption key; ignoring cache', { error });
      return;
    }

    const plaintext = this.decryptCacheBlob(encryptedData.trim(), encryptionKey);
    if (plaintext === null) {
      // A12: legacy CryptoJS-OpenSSL format (or otherwise unparseable). Per
      // plan Option A: delete and force re-auth — no migration code path.
      logger.warn('legacy cache format detected, please re-authenticate');
      await this.deleteCacheAndSalt();
      return;
    }

    try {
      this.credentials = JSON.parse(plaintext);
      logger.debug('Loaded encrypted credentials from file');
      this.applyOriginPolicyAfterLoad();
    } catch (error) {
      logger.warn('Decrypted cache JSON malformed; deleting and re-auth required', { error });
      await this.deleteCacheAndSalt();
    }
  }

  private async saveCachedCredentials(): Promise<void> {
    if (!this.credentials) return;

    // Try OS keychain first (if available)
    const keychainSaved = await this.trySaveToKeychain();
    if (keychainSaved) {
      logger.debug('Saved credentials to OS keychain');
      return;
    }

    // Fall back to encrypted file (AES-256-GCM, native node:crypto).
    try {
      const cacheDir = path.dirname(this.cacheFile);
      await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
      // Review M1 + M4: harden directory perms cross-platform.
      await hardenDirectoryPerms(cacheDir);

      const encryptionKey = await this.getOrCreateEncryptionKey();
      const credentialsJson = JSON.stringify(this.credentials);
      const encrypted = this.encryptCacheBlob(credentialsJson, encryptionKey);
      // Review M1: atomic create-with-mode + immediate chmod (no umask
      // window before perms are tightened).
      await secureWriteFile(this.cacheFile, encrypted);

      logger.debug('Saved encrypted credentials to file');
    } catch (error) {
      logger.warn('Failed to save credentials to cache:', error);
    }
  }

  /**
   * Try to load credentials from the OS keychain via @napi-rs/keyring
   * (optional dependency).
   *
   * Migrated from keytar in v0.3.6 — keytar's transitive prebuild-install
   * was deprecated and unmaintained. @napi-rs/keyring is the actively
   * maintained equivalent. API uses an Entry class; getPassword() returns
   * string | null (null = no entry, throws only on real platform errors).
   */
  private async tryLoadFromKeychain(): Promise<boolean> {
    try {
      // Dynamic import — won't fail if keyring isn't installed
      const { Entry } = await import('@napi-rs/keyring');
      const entry = new Entry('jaumemory-mcp', 'default');

      const password = entry.getPassword();
      if (password) {
        this.credentials = JSON.parse(password);
        return true;
      }
    } catch (error) {
      // keyring not installed, native lib failed to load, or platform error
      logger.debug('OS keychain not available, using file-based storage');
    }
    return false;
  }

  /**
   * Try to save credentials to the OS keychain via @napi-rs/keyring
   * (optional dependency).
   */
  private async trySaveToKeychain(): Promise<boolean> {
    if (!this.credentials) return false;

    try {
      const { Entry } = await import('@napi-rs/keyring');
      const entry = new Entry('jaumemory-mcp', 'default');
      entry.setPassword(JSON.stringify(this.credentials));
      return true;
    } catch (error) {
      logger.debug('OS keychain not available, using file-based storage');
    }
    return false;
  }

  /**
   * Read (or generate + persist) the device-id UUID.
   *
   * v0.5.0+: the server's session-bound refresh mechanism requires
   * a stable per-device identifier. We generate one at first auth,
   * store it in a SEPARATE keyring entry (`'jaumemory-mcp', 'device-id'`)
   * so it survives:
   *   - logout (clearSession only wipes the 'default' credentials entry)
   *   - credential rotation
   *   - upgrade-without-fresh-login
   * Same physical install → same device_id forever, until the user
   * explicitly cleans the keyring.
   *
   * Falls back to a file-based device id when keyring isn't available
   * (platform missing native lib, NTFS perms, etc.). The fallback file
   * sits next to the credentials cache.
   *
   * Returns the device_id string (always non-empty on return).
   */
  private async getOrCreateDeviceId(): Promise<string> {
    // 1. Try keyring 'device-id' entry first.
    try {
      const { Entry } = await import('@napi-rs/keyring');
      const entry = new Entry('jaumemory-mcp', 'device-id');
      const existing = entry.getPassword();
      if (existing && isSafeDeviceId(existing)) {
        return existing;
      }
      if (existing) {
        // 8th-audit Finding 2: persisted value failed the server's
        // [A-Za-z0-9._:-]{1,64} validator. Without overwriting, the
        // next refresh attempt returns 400 invalid_device_id, the
        // refresh handler treats it as terminal and clears
        // credentials — but clearSession() intentionally does NOT
        // wipe this 'device-id' entry (it survives logout by
        // design). So the same corrupted value would keep coming
        // back and the client would never self-heal. Overwrite it
        // with a fresh UUID here so the corrupted state self-heals
        // on the very next auth attempt.
        logger.warn(
          'Persisted device_id (keyring) is malformed; regenerating to self-heal',
        );
      }
      // Generate, persist, return.
      const id = randomUUID();
      entry.setPassword(id);
      logger.debug('Generated and persisted new device_id (keyring)');
      return id;
    } catch {
      // Fall through to file-based fallback.
      logger.debug('Keyring unavailable for device_id; using file fallback');
    }

    // 2. File fallback — store next to credentials cache, mode 600.
    const deviceIdFile = path.join(path.dirname(this.cacheFile), 'device-id');
    try {
      const existing = await fs.readFile(deviceIdFile, 'utf-8');
      const trimmed = existing.trim();
      if (isSafeDeviceId(trimmed)) {
        return trimmed;
      }
      if (trimmed.length > 0) {
        // Same self-heal as the keyring branch above.
        logger.warn(
          'Persisted device_id (file) is malformed; regenerating to self-heal',
        );
      }
    } catch {
      // Not present yet, fall through to create.
    }
    const id = randomUUID();
    try {
      await fs.mkdir(path.dirname(deviceIdFile), { recursive: true, mode: 0o700 });
      // Hardening 0.5.1 (Fix 3): same treatment as every other
      // credential artifact — atomic mode-0600 write + Windows ACL.
      await secureWriteFile(deviceIdFile, id);
      logger.debug('Generated and persisted new device_id (file)');
    } catch (e) {
      logger.warn('Could not persist device_id to file; will regenerate per-process', e);
    }
    return id;
  }

  async clearSession(): Promise<void> {
    // Review M3: propagate partial-clear failure. The previous version
    // swallowed every error from keytar and the cache-file unlink, so
    // a Windows file-lock or NTFS perms issue on `unlink` could leave
    // the encrypted cache on disk while we reported success — the next
    // server start would then resume the session via that file.
    //
    // Distinct error categories:
    //   - keyring module absent (not installed) → debug log, not failure.
    //   - keyring.deletePassword returned false → no entry to clear, not failure.
    //   - keyring.deletePassword threw → real platform error
    //     (libsecret access denied, Keychain locked, ambiguous credential, etc.).
    //   - cache-file unlink ENOENT → not a failure (no cache to clear).
    //   - cache-file unlink other error (EACCES, EBUSY, etc.) → real
    //     failure; throw so logout.ts can surface it to the user.
    //
    // Migrated keytar → @napi-rs/keyring in v0.3.6. The new lib's
    // sync Entry API returns boolean from deletePassword (true if a
    // credential was deleted, false if there was none). Throws are
    // reserved for actual platform errors.
    this.credentials = undefined;

    let keyringError: unknown;
    let keyringAvailable = true;
    try {
      const { Entry } = await import('@napi-rs/keyring');
      const entry = new Entry('jaumemory-mcp', 'default');
      try {
        const deleted = entry.deletePassword();
        logger.debug(deleted
          ? 'Cleared credentials from OS keychain'
          : 'OS keychain had no credentials to clear');
      } catch (err) {
        keyringError = err;
        logger.warn('clearSession: keyring deletePassword failed', { error: err });
      }
    } catch {
      // keyring module not installed (e.g. native build skipped); not a failure.
      keyringAvailable = false;
    }

    let unlinkError: unknown;
    try {
      await fs.unlink(this.cacheFile);
      logger.debug('Cleared cached credentials file');
    } catch (err: any) {
      // ENOENT = no file to clear; not a failure.
      if (err?.code !== 'ENOENT') {
        unlinkError = err;
        logger.error('clearSession: cache-file unlink failed', {
          path: this.cacheFile,
          error: err,
        });
      }
    }

    // Also unlink the salt file (sibling). Failure here is not fatal —
    // re-encryption will use a fresh salt next time, the old salt being
    // useless without the matching cache.
    try {
      const saltFile = path.join(path.dirname(this.cacheFile), '.salt');
      await fs.unlink(saltFile);
    } catch {
      /* salt missing or unreadable — non-fatal */
    }

    // Both keychain and unlink failures = full failure (the persisted
    // cache still exists). Either alone is also a failure: a stuck
    // keychain entry can resume the session on platforms where keyring
    // load order beats file load order.
    if (unlinkError !== undefined) {
      const msg = unlinkError instanceof Error ? unlinkError.message : String(unlinkError);
      throw new Error(`Failed to delete cached credentials file: ${msg}`);
    }
    if (keyringAvailable && keyringError !== undefined) {
      const msg = keyringError instanceof Error ? keyringError.message : String(keyringError);
      throw new Error(`Failed to clear OS keychain entry: ${msg}`);
    }
  }

  async cleanup(): Promise<void> {
    // Save credentials before shutdown
    await this.saveCachedCredentials();
  }

  private async promptForAuthToken(): Promise<string> {
    // Since MCP servers run in non-interactive mode, we need to get the token
    // from environment variable if running in automated mode
    if (process.env.JAUMEMORY_AUTH_TOKEN_MANUAL) {
      return process.env.JAUMEMORY_AUTH_TOKEN_MANUAL;
    }

    // In interactive mode, we would use readline or similar
    // For now, throw an error instructing how to provide the token
    throw new Error(
      'Please set JAUMEMORY_AUTH_TOKEN_MANUAL environment variable with the auth token from your browser.\n' +
      'Then restart the MCP server to complete authentication.'
    );
  }
}
