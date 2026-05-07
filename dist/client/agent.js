/**
 * Agent client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */
import { AgentServiceClient } from '../grpc/clients/agent.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';
export async function createAgentClient(authManager) {
    return new AgentServiceClient(grpcAddress, authManager, grpcUseTls);
}
//# sourceMappingURL=agent.js.map