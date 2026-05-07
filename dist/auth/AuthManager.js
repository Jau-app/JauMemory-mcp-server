/**
 * Authentication Manager
 *
 * Handles the 3-step MCP authentication flow and JWT token management
 */
import axios from 'axios';
import { exec as execCb } from 'child_process';
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
const exec = promisify(execCb);
/**
 * Harden directory permissions cross-platform after creation.
 *
 * Review M1 + M4: the prior pattern was `fs.mkdir({mode: 0o700})` followed
 * by a best-effort `fs.chmod(0o700)`. Two issues:
 *   1. UNIX TOCTOU: between mkdir and chmod, the umask-masked mode might
 *      briefly be looser than 0o700 (e.g. a 0o022 umask gives 0o755),
 *      letting a local attacker peek inside.
 *   2. Windows: chmod is a no-op; the dir inherits ACLs from %APPDATA%\Roaming
 *      which by default grants full access to the user AND read access
 *      to local administrators / SYSTEM. Other admins on the same box
 *      can read the cache.
 *
 * Fix:
 *   - UNIX: chmod immediately (closes the umask window — still has a
 *     micro-TOCTOU but bounded by syscall pair latency).
 *   - Windows: invoke `icacls` to remove inheritance and grant access
 *     only to the current user. Best-effort: failures are logged at
 *     warn level (icacls may be missing on heavily-stripped images).
 */
async function hardenDirectoryPerms(dir) {
    if (process.platform === 'win32') {
        try {
            const username = process.env.USERNAME;
            if (!username) {
                logger.warn('hardenDirectoryPerms: USERNAME unset, skipping icacls', { dir });
                return;
            }
            // /inheritance:r removes inherited ACEs;
            // /grant:r grants the user full control with replace semantics.
            // Quoting handles spaces in dir / username.
            await exec(`icacls "${dir}" /inheritance:r /grant:r "${username}:(OI)(CI)F"`, { windowsHide: true });
        }
        catch (err) {
            logger.warn('hardenDirectoryPerms: icacls failed', { dir, error: err?.message });
        }
    }
    else {
        try {
            await fs.chmod(dir, 0o700);
        }
        catch (err) {
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
async function secureWriteFile(filePath, content) {
    // Pre-unlink so 'wx' (O_CREAT | O_EXCL) succeeds even if the file
    // already exists. Failures here are tolerated — most likely ENOENT.
    try {
        await fs.unlink(filePath);
    }
    catch {
        /* not present */
    }
    await fs.writeFile(filePath, content, { mode: 0o600, flag: 'wx' });
    if (process.platform !== 'win32') {
        try {
            await fs.chmod(filePath, 0o600);
        }
        catch {
            /* best-effort */
        }
    }
}
/**
 * Resolve the per-user cache directory for credentials.
 * - Windows: %APPDATA%\jaumemory-mcp (with sane fallback if APPDATA unset)
 * - Linux/macOS: ~/.config/jaumemory-mcp
 */
function resolveCacheDir() {
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
export class AuthManager {
    apiUrl;
    credentials;
    cacheFile;
    constructor() {
        // Default to production API if not specified
        this.apiUrl = process.env.JAUMEMORY_API_URL || 'https://mem.jau.app';
        // A11: cache lives in user home, not cwd. Per-user, persistent across cwd changes.
        this.cacheFile = path.join(resolveCacheDir(), 'credentials.json');
        // Log configuration (without sensitive data)
        logger.debug('AuthManager initialized', {
            apiUrl: this.apiUrl,
            environment: process.env.NODE_ENV || 'development'
        });
    }
    async initialize() {
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
    async migrateLegacyCacheIfNeeded() {
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
        }
        catch {
            // No legacy cache — nothing to migrate.
            return;
        }
        let newCacheExists = false;
        try {
            await fs.access(newCache);
            newCacheExists = true;
        }
        catch {
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
            // Move salt sibling if present. The pre-seeded-salt guard in
            // getOrCreateEncryptionKey() requires a cache file to coexist before
            // it trusts an old-mtime salt, so the migrated salt is fine as-is
            // (cache + salt land together).
            try {
                await fs.access(legacySalt);
                await fs.rename(legacySalt, newSalt);
            }
            catch {
                // No legacy salt — fine; we'll regenerate one if needed.
            }
            // Clean up empty legacy dir (best-effort).
            try {
                await fs.rmdir(legacyDir);
            }
            catch { /* may have other files */ }
            logger.warn('migrated cache from legacy <cwd>/.auth-cache to user home', {
                from: legacyCache,
                to: newCache
            });
        }
        catch (error) {
            logger.warn('Legacy cache migration failed; proceeding without it', { error });
        }
    }
    async getUserId() {
        return this.credentials?.userId || null;
    }
    async getAuthHeaders() {
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
    async authenticate() {
        // Check if we have cached credentials from previous session
        const requestId = process.env.JAUMEMORY_REQUEST_ID;
        const authToken = process.env.JAUMEMORY_AUTH_TOKEN;
        if (requestId && authToken) {
            try {
                await this.authenticateWithToken(requestId, authToken);
                return;
            }
            catch (error) {
                logger.warn('Cached authentication failed, starting new flow');
            }
        }
        // Otherwise, perform initial authentication
        await this.performMcpLogin();
    }
    async promptForCredentials() {
        // Check if credentials are provided via environment (for CI/CD)
        if (process.env.JAUMEMORY_USERNAME && process.env.JAUMEMORY_EMAIL) {
            return {
                username: process.env.JAUMEMORY_USERNAME,
                email: process.env.JAUMEMORY_EMAIL
            };
        }
        // In MCP context, we need to throw an error with instructions
        throw new Error('\n\n=== MCP AUTHENTICATION REQUIRED ===\n' +
            'Please set the following environment variables:\n' +
            '  JAUMEMORY_USERNAME=your_username\n' +
            '  JAUMEMORY_EMAIL=your_email@example.com\n' +
            '\nThen restart the MCP server to begin authentication.\n' +
            'These are only used to generate the approval link, not for login.\n');
    }
    async performMcpLogin() {
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
        let request_id;
        let approval_url;
        try {
            const loginResponse = await axios.post(`${this.apiUrl}/v1/auth/mcp/login`, {
                date_nonce: dateNonce,
                connection_name: connectionName,
                request_hash: requestHash
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            request_id = loginResponse.data.request_id;
            approval_url = loginResponse.data.approval_url;
            logger.info('MCP login initiated. Please approve the connection:');
            logger.info(`Approval URL: ${approval_url}`);
        }
        catch (error) {
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
        let encryptedAuthToken;
        const maxAttempts = 60; // 5 minutes with 5-second intervals
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            try {
                const checkResponse = await axios.post(`${this.apiUrl}/v1/auth/mcp/check`, {
                    request_id
                });
                if (checkResponse.data.approved && checkResponse.data.encrypted_auth_token) {
                    approved = true;
                    encryptedAuthToken = checkResponse.data.encrypted_auth_token;
                    break;
                }
            }
            catch (error) {
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
    async authenticateWithToken(requestId, authToken) {
        // Generate sync_id: SHA-256(request_id + auth_token)
        const syncId = createHash('sha256');
        syncId.update(requestId);
        syncId.update(authToken);
        const syncIdHex = syncId.digest('hex');
        logger.debug('Authenticating with sync_id approach');
        try {
            const authResponse = await axios.post(`${this.apiUrl}/v1/auth/mcp/authenticate`, {
                sync_id: syncIdHex
            });
            const { access_token, expires_in, user_id } = authResponse.data;
            this.credentials = {
                requestId,
                authToken,
                userId: user_id,
                jwtToken: access_token,
                jwtExpiry: Date.now() + (expires_in * 1000),
                syncId: syncIdHex
            };
            await this.saveCachedCredentials();
        }
        catch (error) {
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
                    }
                    else if (error.response.data.detail) {
                        errorMessage = error.response.data.detail;
                    }
                    else if (error.response.data.error) {
                        errorMessage = error.response.data.error;
                    }
                    else if (error.response.data.message) {
                        errorMessage = error.response.data.message;
                    }
                    else {
                        // Try to stringify, but handle circular references
                        try {
                            errorMessage = JSON.stringify(error.response.data);
                        }
                        catch (e) {
                            errorMessage = 'Authentication failed (serialization error)';
                        }
                    }
                }
                else if (error.message) {
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
            }
            else if (typeof error === 'string') {
                throw new Error(`Authentication failed: ${error}`);
            }
            else {
                // Unknown error type - try to extract message
                let msg = 'Authentication failed';
                try {
                    if (error && typeof error === 'object' && 'message' in error) {
                        msg = String(error.message);
                    }
                    else {
                        msg = String(error);
                    }
                }
                catch (e) {
                    // Can't convert to string
                }
                throw new Error(msg);
            }
        }
    }
    // Public method for login tool
    async login(username, email) {
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
            const loginResponse = await axios.post(`${this.apiUrl}/v1/auth/mcp/login`, {
                date_nonce: dateNonce,
                connection_name: connectionName,
                request_hash: requestHash
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return {
                requestId: loginResponse.data.request_id,
                approvalUrl: loginResponse.data.approval_url
            };
        }
        catch (error) {
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
    }
    // Public method for authenticate tool
    async completeAuthentication(requestId, authToken) {
        await this.authenticateWithToken(requestId, authToken);
    }
    async refreshToken() {
        if (!this.credentials) {
            throw new Error('No credentials to refresh');
        }
        logger.debug('Refreshing JWT token...');
        try {
            await this.authenticateWithToken(this.credentials.requestId, this.credentials.authToken);
        }
        catch (error) {
            logger.error('Failed to refresh token:', error);
            throw new Error('Token refresh failed. Please re-authenticate.');
        }
    }
    isTokenExpired() {
        if (!this.credentials)
            return true;
        // Refresh 5 minutes before expiry
        const bufferTime = 5 * 60 * 1000;
        return Date.now() >= (this.credentials.jwtExpiry - bufferTime);
    }
    deriveRequestKey(username, email, connectionName, dateNonce) {
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
    decryptAuthToken(encryptedToken, key) {
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
    async getOrCreateEncryptionKey() {
        const cacheDir = path.dirname(this.cacheFile);
        const saltFile = path.join(cacheDir, '.salt');
        let salt;
        // Ensure parent dir exists with restrictive perms (review M1 + M4:
        // hardens against umask leak on UNIX and inherited-ACL leak on Windows).
        await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
        await hardenDirectoryPerms(cacheDir);
        let cacheFileExists = false;
        try {
            await fs.access(this.cacheFile);
            cacheFileExists = true;
        }
        catch {
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
        }
        catch {
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
    encryptCacheBlob(plaintext, key) {
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
    decryptCacheBlob(blob, key) {
        let raw;
        try {
            raw = Buffer.from(blob, 'base64');
        }
        catch {
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
        }
        catch {
            return null;
        }
    }
    /**
     * Delete the cache + salt files (best-effort). Used when we detect a legacy
     * CryptoJS-format cache and want a clean slate before forcing re-auth.
     */
    async deleteCacheAndSalt() {
        const saltFile = path.join(path.dirname(this.cacheFile), '.salt');
        try {
            await fs.unlink(this.cacheFile);
        }
        catch { /* may not exist */ }
        try {
            await fs.unlink(saltFile);
        }
        catch { /* may not exist */ }
    }
    /**
     * Try to use keytar (OS keychain) if available, otherwise fall back to encrypted file
     */
    async loadCachedCredentials() {
        // Try keytar first (if available)
        const keytarLoaded = await this.tryLoadFromKeytar();
        if (keytarLoaded) {
            logger.debug('Loaded credentials from OS keychain');
            return;
        }
        // Fall back to encrypted file
        let encryptedData;
        try {
            encryptedData = await fs.readFile(this.cacheFile, 'utf-8');
        }
        catch {
            logger.debug('No cached credentials found');
            return;
        }
        let encryptionKey;
        try {
            encryptionKey = await this.getOrCreateEncryptionKey();
        }
        catch (error) {
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
        }
        catch (error) {
            logger.warn('Decrypted cache JSON malformed; deleting and re-auth required', { error });
            await this.deleteCacheAndSalt();
        }
    }
    async saveCachedCredentials() {
        if (!this.credentials)
            return;
        // Try keytar first (if available)
        const keytarSaved = await this.trySaveToKeytar();
        if (keytarSaved) {
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
        }
        catch (error) {
            logger.warn('Failed to save credentials to cache:', error);
        }
    }
    /**
     * Try to load credentials from OS keychain using keytar (optional dependency)
     */
    async tryLoadFromKeytar() {
        try {
            // Dynamic import - won't fail if keytar is not installed
            const keytar = await import('keytar');
            const service = 'jaumemory-mcp';
            const account = 'default';
            const password = await keytar.getPassword(service, account);
            if (password) {
                this.credentials = JSON.parse(password);
                return true;
            }
        }
        catch (error) {
            // keytar not available or failed to load
            logger.debug('Keytar not available, using file-based storage');
        }
        return false;
    }
    /**
     * Try to save credentials to OS keychain using keytar (optional dependency)
     */
    async trySaveToKeytar() {
        if (!this.credentials)
            return false;
        try {
            // Dynamic import - won't fail if keytar is not installed
            const keytar = await import('keytar');
            const service = 'jaumemory-mcp';
            const account = 'default';
            await keytar.setPassword(service, account, JSON.stringify(this.credentials));
            return true;
        }
        catch (error) {
            // keytar not available or failed to save
            logger.debug('Keytar not available, using file-based storage');
        }
        return false;
    }
    async clearSession() {
        // Review M3: propagate partial-clear failure. The previous version
        // swallowed every error from keytar and the cache-file unlink, so
        // a Windows file-lock or NTFS perms issue on `unlink` could leave
        // the encrypted cache on disk while we reported success — the next
        // server start would then resume the session via that file.
        //
        // Distinct error categories:
        //   - keytar absent (module not installed) → debug log, not failure.
        //   - keytar.deletePassword threw with module loaded → real failure.
        //   - cache-file unlink ENOENT → not a failure (no cache to clear).
        //   - cache-file unlink other error (EACCES, EBUSY, etc.) → real
        //     failure; throw so logout.ts can surface it to the user.
        this.credentials = undefined;
        let keytarError;
        let keytarAvailable = true;
        try {
            const keytar = await import('keytar');
            const service = 'jaumemory-mcp';
            const account = 'default';
            try {
                await keytar.deletePassword(service, account);
                logger.debug('Cleared credentials from OS keychain');
            }
            catch (err) {
                keytarError = err;
                logger.warn('clearSession: keytar deletePassword failed', { error: err });
            }
        }
        catch {
            // keytar module not installed; not a failure.
            keytarAvailable = false;
        }
        let unlinkError;
        try {
            await fs.unlink(this.cacheFile);
            logger.debug('Cleared cached credentials file');
        }
        catch (err) {
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
        }
        catch {
            /* salt missing or unreadable — non-fatal */
        }
        // Both keytar and unlink failures = full failure (the persisted
        // cache still exists). Either alone is also a failure: a stuck
        // keychain entry can resume the session on platforms where keytar
        // load order beats file load order.
        if (unlinkError !== undefined) {
            const msg = unlinkError instanceof Error ? unlinkError.message : String(unlinkError);
            throw new Error(`Failed to delete cached credentials file: ${msg}`);
        }
        if (keytarAvailable && keytarError !== undefined) {
            const msg = keytarError instanceof Error ? keytarError.message : String(keytarError);
            throw new Error(`Failed to clear OS keychain entry: ${msg}`);
        }
    }
    async cleanup() {
        // Save credentials before shutdown
        await this.saveCachedCredentials();
    }
    async promptForAuthToken() {
        // Since MCP servers run in non-interactive mode, we need to get the token
        // from environment variable if running in automated mode
        if (process.env.JAUMEMORY_AUTH_TOKEN_MANUAL) {
            return process.env.JAUMEMORY_AUTH_TOKEN_MANUAL;
        }
        // In interactive mode, we would use readline or similar
        // For now, throw an error instructing how to provide the token
        throw new Error('Please set JAUMEMORY_AUTH_TOKEN_MANUAL environment variable with the auth token from your browser.\n' +
            'Then restart the MCP server to complete authentication.');
    }
}
//# sourceMappingURL=AuthManager.js.map