/**
 * Consolidation Service gRPC Client
 * 
 * Handles memory consolidation operations via gRPC
 */

import { buildCredentials } from '../../client/tls-config.js';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AuthManager } from '../../auth/AuthManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load proto file
const PROTO_PATH = path.join(__dirname, '../../../proto/memory.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [path.join(__dirname, '../../../proto')]
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const ConsolidationService = protoDescriptor.jaumemory.v1.ConsolidationService;

export interface ConsolidationStrategy {
  similarity_threshold?: number;
  min_group_size?: number;
  archive_originals?: boolean;
}

export interface ConsolidateRequest {
  strategy: ConsolidationStrategy;
  dry_run?: boolean;
}

export interface ConsolidateResponse {
  memories_affected: number;
  consolidations_performed: any[];
  insights_generated: any[];
  space_saved?: number;
}

export class ConsolidationServiceClient {
  private client: any;
  private authManager: AuthManager;

  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    this.authManager = authManager;

    // Create credentials
    const credentials = buildCredentials(useTls);

    // Create client
    this.client = new ConsolidationService(address, credentials);

    logger.info('ConsolidationServiceClient initialized', { address, useTls });
  }

  private async getMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const userId = await this.authManager.getUserId();
    
    if (!userId) {
      throw new Error('User not authenticated');
    }

    metadata.add('user-id', userId);
    
    // Add auth headers if available
    const authHeaders = this.authManager.getAuthHeaders ? 
      await this.authManager.getAuthHeaders() : null;
    
    if (authHeaders) {
      Object.entries(authHeaders).forEach(([key, value]) => {
        if (typeof value === 'string') {
          metadata.add(key.toLowerCase(), value);
        }
      });
    }

    return metadata;
  }

  async consolidateMemories(request: ConsolidateRequest): Promise<ConsolidateResponse> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.consolidateMemories({
        strategy: {
          similarity_threshold: request.strategy.similarity_threshold || 0.7,
          min_group_size: request.strategy.min_group_size || 2,
          archive_originals: request.strategy.archive_originals !== false
        },
        dry_run: request.dry_run || false
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('ConsolidateMemories error:', error);
          reject(error);
        } else {
          resolve({
            memories_affected: response.memories_affected || 0,
            consolidations_performed: response.consolidations_performed || [],
            insights_generated: response.insights_generated || [],
            space_saved: response.space_saved
          });
        }
      });
    });
  }
}