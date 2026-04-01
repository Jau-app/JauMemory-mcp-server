/**
 * Memory client factory for production
 */

import { MemoryServiceClient } from '../grpc/clients/memory.js';
import { AuthManager } from '../auth/AuthManager.js';

export async function createMemoryClient(authManager: AuthManager): Promise<MemoryServiceClient> {
  // Default to production URL if not specified
  const address = process.env.JAUMEMORY_GRPC_URL || 'mem.jau.app:50051';

  // For now, production gRPC doesn't use TLS (traffic is already encrypted via VPN/internal network)
  // Only use TLS if explicitly enabled via environment variable
  const useTls = process.env.JAUMEMORY_GRPC_USE_TLS === 'true';

  return new MemoryServiceClient(address, authManager, useTls);
}