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
export declare function logoutTool(clients: BackendClients): Tool;
//# sourceMappingURL=logout.d.ts.map