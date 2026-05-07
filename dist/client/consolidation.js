/**
 * Consolidation client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */
import { ConsolidationServiceClient } from '../grpc/clients/consolidation.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';
export async function createConsolidationClient(authManager) {
    return new ConsolidationServiceClient(grpcAddress, authManager, grpcUseTls);
}
//# sourceMappingURL=consolidation.js.map