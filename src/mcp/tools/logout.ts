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
import { logger } from '../../utils/logger.js';

export function logoutTool(clients: BackendClients): Tool {
  return {
    name: 'mcp_logout',
    description: 'Logout and revoke the current MCP session.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    handler: async (_args: any) => {
      const apiUrl = process.env.JAUMEMORY_API_URL;

      // Snapshot auth headers BEFORE clearing local state — clearSession
      // wipes the AuthManager's in-memory creds, so we wouldn't be able
      // to authenticate the revocation call afterwards.
      let authHeaders: Record<string, string> | undefined;
      try {
        authHeaders = await clients.auth.getAuthHeaders?.();
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
      if (authHeaders && apiUrl) {
        try {
          await axios.post(
            `${apiUrl}/v1/auth/logout`,
            {},
            {
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              timeout: 5000,
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
      if (!apiUrl) {
        outcome += ' Server revocation skipped (JAUMEMORY_API_URL not set).';
      } else if (!authHeaders) {
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
