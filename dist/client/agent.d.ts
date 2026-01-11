/**
 * Agent client factory for production
 */
import { AgentServiceClient } from '../grpc/clients/agent.js';
import { AuthManager } from '../auth/AuthManager.js';
export declare function createAgentClient(authManager: AuthManager): Promise<AgentServiceClient>;
//# sourceMappingURL=agent.d.ts.map