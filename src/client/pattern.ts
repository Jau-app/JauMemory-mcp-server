/**
 * Pattern client factory for production
 */

import { PatternServiceClient } from '../grpc/clients/pattern.js';
import { AuthManager } from '../auth/AuthManager.js';

export async function createPatternClient(authManager: AuthManager): Promise<PatternServiceClient> {
  // Default to production URL if not specified
  const address = process.env.JAUMEMORY_GRPC_URL || 'mem.jau.app:50051';
  
  const useTls = process.env.JAUMEMORY_GRPC_USE_TLS === 'true';
  
  return new PatternServiceClient(address, authManager, useTls);
}