/**
 * Schedules client factory for production
 */

import { SchedulesServiceClient } from '../grpc/clients/schedules.js';
import { AuthManager } from '../auth/AuthManager.js';
import { grpcAddress, grpcUseTls } from './tls-config.js';

export async function createSchedulesClient(authManager: AuthManager): Promise<SchedulesServiceClient> {
  return new SchedulesServiceClient(grpcAddress, authManager, grpcUseTls);
}
