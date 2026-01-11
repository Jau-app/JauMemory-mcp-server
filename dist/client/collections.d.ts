/**
 * Collections client factory for production
 */
import { CollectionsServiceClient } from '../grpc/clients/collections.js';
import { AuthManager } from '../auth/AuthManager.js';
export declare function createCollectionsClient(authManager: AuthManager): Promise<CollectionsServiceClient>;
//# sourceMappingURL=collections.d.ts.map