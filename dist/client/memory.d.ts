/**
 * Memory client factory for production
 */
import { MemoryServiceClient } from '../grpc/clients/memory.js';
import { AuthManager } from '../auth/AuthManager.js';
export declare function createMemoryClient(authManager: AuthManager): Promise<MemoryServiceClient>;
//# sourceMappingURL=memory.d.ts.map