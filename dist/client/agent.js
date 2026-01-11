/**
 * Agent client factory for production
 */
import { AgentServiceClient } from '../grpc/clients/agent.js';
export async function createAgentClient(authManager) {
    // Default to production URL if not specified
    const address = process.env.JAUMEMORY_GRPC_URL || 'mem.jau.app:50051';
    const useTls = process.env.JAUMEMORY_GRPC_USE_TLS === 'true';
    return new AgentServiceClient(address, authManager, useTls);
}
//# sourceMappingURL=agent.js.map