/**
 * MCP Prompts
 */
import type { BackendClients } from '../../types/clients.js';
export interface Prompt {
    name: string;
    description: string;
    arguments?: Array<{
        name: string;
        description: string;
        required: boolean;
    }>;
    handler: (args: any) => Promise<string>;
}
export declare function setupPrompts(clients: BackendClients): Record<string, Prompt>;
//# sourceMappingURL=index.d.ts.map