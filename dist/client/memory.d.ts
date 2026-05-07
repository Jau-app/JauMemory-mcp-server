/**
 * Memory client factory for production.
 *
 * Plan A2: TLS defaults ON via shared `tls-config.ts`. The previous
 * inline `JAUMEMORY_GRPC_USE_TLS === 'true'` defaulted to plaintext —
 * JWTs and memory content travelled cleartext to mem.jau.app:50051
 * unless the operator explicitly opted in. The shared helper inverts
 * this and refuses to disable TLS under NODE_ENV=production.
 */
import { MemoryServiceClient } from '../grpc/clients/memory.js';
import { AuthManager } from '../auth/AuthManager.js';
export declare function createMemoryClient(authManager: AuthManager): Promise<MemoryServiceClient>;
//# sourceMappingURL=memory.d.ts.map