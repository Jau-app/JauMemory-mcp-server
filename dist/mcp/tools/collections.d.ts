/**
 * Collection Management Tools
 *
 * Tools for creating and managing memory collections
 */
import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
export declare function createCollectionTool(clients: BackendClients): Tool;
export declare function listCollectionsTool(clients: BackendClients): Tool;
export declare function addToCollectionTool(clients: BackendClients): Tool;
export declare function getCollectionTool(clients: BackendClients): Tool;
export declare function removeFromCollectionTool(clients: BackendClients): Tool;
export declare function updateCollectionTool(clients: BackendClients): Tool;
export declare function deleteCollectionTool(clients: BackendClients): Tool;
export declare function consolidateCollectionTool(clients: BackendClients): Tool;
//# sourceMappingURL=collections.d.ts.map