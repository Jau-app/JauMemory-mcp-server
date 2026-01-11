/**
 * MCP Tools Router
 *
 * Exports all available tools for the MCP server.
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
export declare function setupTools(clients: BackendClients): Record<string, Tool>;
//# sourceMappingURL=index.d.ts.map