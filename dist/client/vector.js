/**
 * Vector client factory for production
 */
import { VectorServiceClient } from '../grpc/clients/vector.js';
export async function createVectorClient(authManager) {
    // Default to production URL if not specified
    const address = process.env.JAUMEMORY_GRPC_URL || 'mem.jau.app:50051';
    const useTls = process.env.JAUMEMORY_GRPC_USE_TLS === 'true';
    return new VectorServiceClient(address, authManager, useTls);
}
//# sourceMappingURL=vector.js.map