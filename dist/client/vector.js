/**
 * Vector client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */
import { VectorServiceClient } from '../grpc/clients/vector.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';
export async function createVectorClient(authManager) {
    return new VectorServiceClient(grpcAddress, authManager, grpcUseTls);
}
//# sourceMappingURL=vector.js.map