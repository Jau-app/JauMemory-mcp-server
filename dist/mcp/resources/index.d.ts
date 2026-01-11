/**
 * MCP Resources
 */
import type { BackendClients } from '../../types/clients.js';
export interface Resource {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
    handler: () => Promise<any>;
}
export declare function setupResources(clients: BackendClients): Record<string, Resource>;
//# sourceMappingURL=index.d.ts.map