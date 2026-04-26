/**
 * Vector client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */

import { VectorServiceClient } from '../grpc/clients/vector.js';
import { AuthManager } from '../auth/AuthManager.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';

export async function createVectorClient(authManager: AuthManager): Promise<VectorServiceClient> {
  return new VectorServiceClient(grpcAddress, authManager, grpcUseTls);
}
