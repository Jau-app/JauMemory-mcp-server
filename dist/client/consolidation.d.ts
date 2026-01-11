/**
 * Consolidation client factory for production
 */
import { ConsolidationServiceClient } from '../grpc/clients/consolidation.js';
import { AuthManager } from '../auth/AuthManager.js';
export declare function createConsolidationClient(authManager: AuthManager): Promise<ConsolidationServiceClient>;
//# sourceMappingURL=consolidation.d.ts.map