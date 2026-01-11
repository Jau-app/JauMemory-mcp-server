/**
 * Client type definitions
 */
import type { MemoryServiceClient } from '../grpc/clients/memory.js';
import type { VectorServiceClient } from '../grpc/clients/vector.js';
import type { PatternServiceClient } from '../grpc/clients/pattern.js';
import type { ConsolidationServiceClient } from '../grpc/clients/consolidation.js';
import type { AgentServiceClient } from '../grpc/clients/agent.js';
import type { CollectionsServiceClient } from '../grpc/clients/collections.js';
export interface BackendClients {
    memory: MemoryServiceClient;
    vector: VectorServiceClient;
    pattern: PatternServiceClient;
    consolidation: ConsolidationServiceClient;
    agent: AgentServiceClient;
    collections: CollectionsServiceClient;
    auth: {
        getCurrentUserId: () => Promise<string>;
        getAuthHeaders?: () => Promise<Record<string, string>>;
        clearSession?: () => Promise<void>;
        authManager?: any;
    };
}
//# sourceMappingURL=clients.d.ts.map