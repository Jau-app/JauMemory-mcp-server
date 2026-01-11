/**
 * Collections client factory for production
 */
import { CollectionsServiceClient } from '../grpc/clients/collections.js';
export async function createCollectionsClient(authManager) {
    // Default to production URL if not specified
    const address = process.env.JAUMEMORY_GRPC_URL || 'mem.jau.app:50051';
    const useTls = process.env.JAUMEMORY_GRPC_USE_TLS === 'true';
    try {
        const client = new CollectionsServiceClient(address, authManager, useTls);
        // console.log('[Collections] Client created successfully for address:', address);
        return client;
    }
    catch (error) {
        console.error('[Collections] Failed to create client:', error);
        throw error;
    }
}
//# sourceMappingURL=collections.js.map