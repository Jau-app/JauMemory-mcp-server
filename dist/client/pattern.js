/**
 * Pattern client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */
import { PatternServiceClient } from '../grpc/clients/pattern.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';
export async function createPatternClient(authManager) {
    return new PatternServiceClient(grpcAddress, authManager, grpcUseTls);
}
//# sourceMappingURL=pattern.js.map