/**
 * Client info propagation
 *
 * Captures the calling MCP client's identity from the SDK's initialize
 * handshake and forwards it to the JauMemory backend via the User-Agent
 * header on every axios request. This lets the backend tag each session
 * with the actual MCP client (Claude Desktop, Cursor, Copilot, etc.)
 * instead of the opaque "axios/1.16.0" the request would otherwise carry.
 *
 * Per MCP spec, the client sends `clientInfo: { name, version }` in its
 * initialize request. The TypeScript SDK exposes that via
 * `server.getClientVersion()` (populated after handshake completes).
 */

import axios from 'axios';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

const PKG_NAME = '@jaumemory/mcp-server';
// Match the version in package.json. Bumped here when publishing a new
// version that changes wire format.
//   0.3.5 — first version to forward MCP clientInfo upstream
//   0.3.6 — keytar → @napi-rs/keyring (no User-Agent change)
const PKG_VERSION = '0.3.6';

/**
 * Install a global axios request interceptor that sets the User-Agent
 * header to identify this MCP server + the calling MCP client.
 *
 * Format:
 *   `@jaumemory/mcp-server/<pkg-version> node/<runtime> (<client>/<ver>)`
 *
 * The trailing parenthesized client tuple is omitted on requests that
 * happen before the initialize handshake completes (rare, since auth
 * flows trigger after the first tool call).
 *
 * Idempotent — safe to call multiple times during boot.
 */
export function installClientInfoInterceptor(server: Server): void {
    const baseUa = `${PKG_NAME}/${PKG_VERSION} node/${process.version}`;

    axios.interceptors.request.use((config) => {
        const cv = server.getClientVersion();
        const clientPart =
            cv && cv.name ? ` (${cv.name}/${cv.version || 'unknown'})` : '';

        // Don't clobber an explicitly-set User-Agent on a per-call basis.
        config.headers = config.headers || {};
        const existing = (config.headers as Record<string, string>)['User-Agent'];
        if (!existing) {
            (config.headers as Record<string, string>)['User-Agent'] =
                `${baseUa}${clientPart}`;
        }
        return config;
    });
}
