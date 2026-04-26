/**
 * Pattern client factory for production.
 * Plan A2: TLS default-on via shared tls-config.
 */

import { PatternServiceClient } from '../grpc/clients/pattern.js';
import { AuthManager } from '../auth/AuthManager.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';

export async function createPatternClient(authManager: AuthManager): Promise<PatternServiceClient> {
  return new PatternServiceClient(grpcAddress, authManager, grpcUseTls);
}
