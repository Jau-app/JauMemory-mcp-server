/**
 * Consolidation client factory for production
 */
import { ConsolidationServiceClient } from '../grpc/clients/consolidation.js';
export async function createConsolidationClient(authManager) {
    // Default to production URL if not specified
    const address = process.env.JAUMEMORY_GRPC_URL || 'mem.jau.app:50051';
    const useTls = process.env.JAUMEMORY_GRPC_USE_TLS === 'true';
    return new ConsolidationServiceClient(address, authManager, useTls);
}
//# sourceMappingURL=consolidation.js.map