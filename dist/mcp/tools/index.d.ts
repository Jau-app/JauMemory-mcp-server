/**
 * MCP Tools Router
 *
 * Supports two modes via MCP_TOOL_LOADING env var:
 *   "flat"    (default) — all 43 tools in tools/list
 *   "grouped" — 12 tools: 8 category routers + 4 direct tools
 *               (mcp_authenticate hidden, schema provided by mcp_login response)
 */
import type { BackendClients } from '../../types/clients.js';
export interface Tool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
    handler: (args: any) => Promise<any>;
}
/**
 * Setup tools based on MCP_TOOL_LOADING mode.
 *
 * Returns { listed, all }:
 *   - listed: tools to show in tools/list
 *   - all: tools that can be called (includes hidden ones in grouped mode)
 *
 * In flat mode, listed === all.
 */
export declare function setupTools(clients: BackendClients): {
    listed: Record<string, Tool>;
    all: Record<string, Tool>;
};
//# sourceMappingURL=index.d.ts.map