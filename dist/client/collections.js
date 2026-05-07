/**
 * Collections client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */
import { CollectionsServiceClient } from '../grpc/clients/collections.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';
export async function createCollectionsClient(authManager) {
    try {
        return new CollectionsServiceClient(grpcAddress, authManager, grpcUseTls);
    }
    catch (error) {
        console.error('[Collections] Failed to create client:', error);
        throw error;
    }
}
//# sourceMappingURL=collections.js.map