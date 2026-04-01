/**
 * Skills client factory for production
 */

import { SkillsServiceClient } from '../grpc/clients/skills.js';
import { AuthManager } from '../auth/AuthManager.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';

export async function createSkillsClient(authManager: AuthManager): Promise<SkillsServiceClient> {
  return new SkillsServiceClient(grpcAddress, authManager, grpcUseTls);
}
