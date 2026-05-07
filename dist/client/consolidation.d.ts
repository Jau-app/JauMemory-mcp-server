/**
 * Consolidation client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */
import { ConsolidationServiceClient } from '../grpc/clients/consolidation.js';
import { AuthManager } from '../auth/AuthManager.js';
export declare function createConsolidationClient(authManager: AuthManager): Promise<ConsolidationServiceClient>;
//# sourceMappingURL=consolidation.d.ts.map