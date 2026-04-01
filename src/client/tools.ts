/**
 * Tools client factory for production
 */

import { ToolsServiceClient } from '../grpc/clients/tools.js';
import { AuthManager } from '../auth/AuthManager.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';

export async function createToolsClient(authManager: AuthManager): Promise<ToolsServiceClient> {
  return new ToolsServiceClient(grpcAddress, authManager, grpcUseTls);
}
