/**
 * Client type definitions
 */

import type { MemoryServiceClient } from '../grpc/clients/memory.js';
import type { VectorServiceClient } from '../grpc/clients/vector.js';
import type { PatternServiceClient } from '../grpc/clients/pattern.js';
import type { ConsolidationServiceClient } from '../grpc/clients/consolidation.js';
import type { AgentServiceClient } from '../grpc/clients/agent.js';
import type { CollectionsServiceClient } from '../grpc/clients/collections.js';
import type { CredentialsServiceClient } from '../grpc/clients/credentials.js';
import type { ToolsServiceClient } from '../grpc/clients/tools.js';
import type { SkillsServiceClient } from '../grpc/clients/skills.js';
import type { SchedulesServiceClient } from '../grpc/clients/schedules.js';

export interface BackendClients {
  memory: MemoryServiceClient;
  vector: VectorServiceClient;
  pattern: PatternServiceClient;
  consolidation: ConsolidationServiceClient;
  agent: AgentServiceClient;
  collections: CollectionsServiceClient;
  credentials: CredentialsServiceClient;
  tools: ToolsServiceClient;
  skills: SkillsServiceClient;
  schedules: SchedulesServiceClient;
  auth: {
    getCurrentUserId: () => Promise<string>;
    getAuthHeaders?: () => Promise<Record<string, string>>;
    clearSession?: () => Promise<void>;
    authManager?: any; // AuthManager instance for login tool
  };
}