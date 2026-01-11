/**
 * Pattern client factory for production
 */
import { PatternServiceClient } from '../grpc/clients/pattern.js';
export async function createPatternClient(authManager) {
    // Default to production URL if not specified
    const address = process.env.JAUMEMORY_GRPC_URL || 'mem.jau.app:50051';
    const useTls = process.env.JAUMEMORY_GRPC_USE_TLS === 'true';
    return new PatternServiceClient(address, authManager, useTls);
}
//# sourceMappingURL=pattern.js.map