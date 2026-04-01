/**
 * Credentials client factory for production
 */

import { CredentialsServiceClient } from '../grpc/clients/credentials.js';
import { AuthManager } from '../auth/AuthManager.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';

export async function createCredentialsClient(authManager: AuthManager): Promise<CredentialsServiceClient> {
  return new CredentialsServiceClient(grpcAddress, authManager, grpcUseTls);
}
