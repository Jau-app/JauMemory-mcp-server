/**
 * Vector client factory for production
 */
import { VectorServiceClient } from '../grpc/clients/vector.js';
import { AuthManager } from '../auth/AuthManager.js';
export declare function createVectorClient(authManager: AuthManager): Promise<VectorServiceClient>;
//# sourceMappingURL=vector.d.ts.map