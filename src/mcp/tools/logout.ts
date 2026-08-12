/**
 * MCP Logout Tool
 *
 * Plan A8: local cache clear is GUARANTEED, server revocation is best-effort.
 *
 * The previous implementation called the server first and returned its
 * error before clearing local state, so a backend outage left the cached
 * credential file on disk and the next tool call resumed a session the
 * user thought they'd ended. Rewritten so the two halves fail
 * independently:
 *   1. Capture auth headers (needed for the server call below).
 *   2. Clear local state — `clearSession` + cache file delete — in its
 *      own try. This MUST succeed before we report logout to the user.
 *   3. Best-effort POST /v1/auth/logout in a second try. Failure here is
 *      logged but does not block the response — the local clear has
 *      already happened, so the local client cannot be re-used to talk
 *      to the server. The server-side token will eventually expire
 *      naturally even if revocation didn't land.
 *   4. Report which halves succeeded so the caller knows whether the
 *      server was reached.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import axios from 'axios';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { boundedPost } from '../../config/httpPolicy.js';

const logoutSchema = z.object({
  /**
   * v0.5.0+: scoped logout.
   * - `this` (default): revoke only this session. Other devices'
   *   sessions keep working. Matches the user expectation "log out
   *   of this app."
   * - `all`: revoke EVERY MCP session + OAuth + refresh + user
   *   session for the user. The pre-v4 carpet-bomb behavior. Used
   *   by "Log out of all devices" dashboard buttons.
   * - `others`: revoke all sessions EXCEPT this one. Useful after
   *   spotting a session you don't recognize.
   *
   * Older servers (pre-V090) ignore the field and behave as if
   * scope=all was sent — that's the existing carpet-bomb behavior,
   * so no NEW regression on old backends.
   */
  scope: z.enum(['this', 'all', 'others']).optional().default('this'),
  /**
   * Hardening 0.5.1 (Fix 2, auditor-recommended escape hatch): when
   * true, clear local credentials WITHOUT attempting server-side
   * revocation. This is the explicit offline-logout selector — env-var
   * absence is no longer a behavior switch.
   */
  local_only: z.boolean().optional().default(false),
});

export function logoutTool(clients: BackendClients): Tool {
  return {
    name: 'mcp_logout',
    description: 'Logout and revoke the current MCP session. Pass scope="all" to log out of all devices, or scope="others" to log out everywhere else but here. Defaults to scope="this" (only the calling session).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['this', 'all', 'others'],
          description: 'Scope of the logout. "this" (default) = only this session. "all" = every device. "others" = everywhere else but here.',
        },
        local_only: {
          type: 'boolean',
          description: 'When true, clear local credentials only — no server-side revocation call is made. Default false.',
        },
      },
      required: [],
    },
    handler: async (args: any) => {
      const input = logoutSchema.parse(args ?? {});

      // Snapshot auth headers + session_id BEFORE clearing local
      // state — clearSession wipes the AuthManager's in-memory creds,
      // so we wouldn't be able to authenticate the revocation call
      // afterwards. We also need the session_id (added in v0.5.0
      // credentials) for scope=this/others server-side dispatch.
      let authHeaders: Record<string, string> | undefined;
      let sessionId: string | undefined;
      let revokeOrigin: string | undefined;
      try {
        authHeaders = await clients.auth.getAuthHeaders?.();
        // The AuthManager stores credentials including sessionId
        // (added in v0.5.0). Old credentials (pre-0.5.0) don't have
        // it; scope=this/others on the server with no session_id
        // returns 400, which we catch and log.
        sessionId = clients.auth.authManager?.credentials?.sessionId;
        // Hardening 0.5.1 (Fix 2): revocation goes to the ORIGIN that
        // issued these credentials — never an env-resolved URL. If no
        // credentials exist there is nothing to revoke anywhere.
        revokeOrigin = clients.auth.authManager?.credentials?.origin;
      } catch (err) {
        // No active session — nothing to revoke server-side, but we
        // still attempt the local clear in case there's a stale cache.
        logger.debug('mcp_logout: no auth headers available', { err });
      }

      // Step 1: clear local state. This is the half we guarantee.
      let localCleared = false;
      let localError: unknown = undefined;
      try {
        await clients.auth.clearSession?.();
        localCleared = true;
      } catch (err) {
        localError = err;
        logger.error('mcp_logout: local clear failed', { error: err });
      }

      // Step 2: best-effort server revocation. Skipped if we never had
      // headers (no active session) or if the API URL isn't configured.
      let serverRevoked = false;
      let serverError: string | undefined;
      if (!input.local_only && authHeaders && revokeOrigin) {
        try {
          // Review M2: 30s timeout (was 5s). For a "credential possibly
          // stolen" logout flow, 5s is too aggressive — TLS handshake
          // stalls, revocation-table contention during a deploy, or a
          // momentarily congested link can all blow that budget. 30s is
          // long enough for nearly any legitimate revocation while still
          // bounding worst-case UX latency. Local clear has already
          // happened before this call, so the user-visible cache is gone
          // regardless of revocation outcome.
          //
          // 8th-audit Finding 1: scope=this and scope=others REQUIRE a
          // session_id server-side; without it the V090 handler returns
          // 400 missing_session_id, server revocation fails, and the
          // user's other-device sessions stay live even though local
          // creds are now gone. This is exactly the case for users
          // upgrading FROM npm 0.4.0 — their keyring 'default' entry
          // predates session_id capture. Fall back to scope=all
          // (carpet-bomb) when sessionId is missing so server-side
          // revocation succeeds with the pre-v4 semantics. The local
          // half has already happened either way, so the worst case is
          // simply that more device-level state is revoked, which is
          // strictly safer for a logout the user just initiated.
          let effectiveScope = input.scope;
          if (!sessionId && (effectiveScope === 'this' || effectiveScope === 'others')) {
            logger.warn(
              `mcp_logout: no session_id available (likely upgraded from npm < 0.5.0); ` +
              `falling back from scope="${effectiveScope}" to scope="all" to preserve ` +
              `server-side revocation`,
            );
            effectiveScope = 'all';
          }
          // v0.5.0+: send scope + session_id. Old servers that don't
          // know about the fields treat the body as empty and run
          // the existing carpet-bomb revoke — backwards-compatible.
          await boundedPost(
            `${revokeOrigin}/v1/auth/logout`,
            {
              scope: effectiveScope,
              ...(sessionId ? { session_id: sessionId } : {}),
            },
            {
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              timeout: 30000,
            }
          );
          serverRevoked = true;
        } catch (err) {
          if (axios.isAxiosError(err)) {
            serverError = err.response?.data?.detail || err.message;
          } else if (err instanceof Error) {
            serverError = err.message;
          } else {
            serverError = String(err);
          }
          logger.warn('mcp_logout: server revocation failed (local already cleared)', {
            error: serverError,
          });
        }
      }

      // Compose user-facing summary. Local-clear failure is rare but
      // serious — surface it as an error so the user knows the cache
      // file may still be on disk; manual delete may be required.
      if (!localCleared) {
        const msg = localError instanceof Error ? localError.message : String(localError);
        throw new Error(`Logout failed: could not clear local credentials (${msg}).`);
      }

      let outcome = 'Local credentials cleared.';
      if (input.local_only) {
        outcome += ' Server revocation intentionally skipped (local_only=true).';
      } else if (!authHeaders || !revokeOrigin) {
        outcome += ' Server revocation skipped (no active session).';
      } else if (serverRevoked) {
        outcome += ' Server session revoked.';
      } else {
        outcome += ` Server unreachable (${serverError ?? 'unknown error'}); local clear is final — token will expire on the server normally.`;
      }
      outcome += '\n\nTo authenticate again, use the mcp_login tool.';

      return [
        { type: 'text', text: outcome }
      ];
    }
  };
}
