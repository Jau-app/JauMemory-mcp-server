/**
 * Agent client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */

import { AgentServiceClient } from '../grpc/clients/agent.js';
import { AuthManager } from '../auth/AuthManager.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';

export async function createAgentClient(authManager: AuthManager): Promise<AgentServiceClient> {
  return new AgentServiceClient(grpcAddress, authManager, grpcUseTls);
}
