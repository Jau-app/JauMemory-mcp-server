/**
 * Memory Service gRPC Client for Production
 * 
 * Connects to the JauMemory cloud service with authentication and TLS
 */

import { buildCredentials } from '../../client/tls-config.js';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { redactSecrets } from '../../utils/redaction.js';
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
const MemoryService = protoDescriptor.jaumemory.v1.MemoryService;

/**
 * Parse a user-supplied date for the `timeRange` filter.
 *
 * Bare date strings (`"2026-04-21"`) are interpreted in the process's
 * local timezone, not UTC. Plain `new Date("2026-04-21")` treats the
 * string as UTC midnight, which makes "today" off-by-one for any
 * timezone west of UTC — a memory stored at 3pm local on Monday would
 * be invisible to a caller asking for `{start: "Monday"}`.
 *
 * For `start`, local midnight of the given day is used.
 * For `end`, local end-of-day (23:59:59.999) is used so the named day
 * is inclusive, matching most users' intuition.
 *
 * Fully-qualified ISO strings with timezone (e.g. `"2026-04-21T00:00:00Z"`)
 * or `Date` instances are passed through unchanged.
 */
function parseUserDate(input: Date | string, edge: 'start' | 'end'): Date {
  if (input instanceof Date) return input;
  // Bare YYYY-MM-DD — no time, no timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const suffix = edge === 'start' ? 'T00:00:00' : 'T23:59:59.999';
    return new Date(`${input}${suffix}`); // local tz per JS spec
  }
  return new Date(input);
}

export interface CreateMemoryRequest {
  userId: string;
  content: string;
  context?: string;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface Memory {
  id: string;
  userId: string;
  content: string;
  context?: string;
  importance: number;
  memoryType?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  embeddingId?: string;
  metadata: Record<string, any>;
}

export interface RecallMemoriesRequest {
  userId: string;
  /** Optional — omit for filters-only search. Proto field is optional string. */
  query?: string;
  mode?: 'keyword' | 'semantic' | 'hybrid';
  limit?: number;
  minImportance?: number;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  timeRange?: {
    start?: Date | string;
    end?: Date | string;
  };
  fuzzyThreshold?: number;
}

export interface MemoryResult {
  memory: Memory;
  relevanceScore: number;
  matchedTerms: string[];
}

export interface RecallMemoriesResponse {
  results: MemoryResult[];
  totalCount: number;
  nextPageToken?: string;
}

export class MemoryServiceClient {
  private client: any;
  private authManager: AuthManager;
  
  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    // Create credentials
    const credentials = buildCredentials(useTls);
    
    this.client = new MemoryService(address, credentials);
    this.authManager = authManager;
    
    logger.debug(`Connected to Memory Service at ${address} (TLS: ${useTls})`);
  }
  
  private async createMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const authHeaders = await this.authManager.getAuthHeaders();
    
    logger.debug('Creating gRPC metadata with auth headers:', redactSecrets(authHeaders));

    // Add auth headers
    Object.entries(authHeaders).forEach(([key, value]) => {
      metadata.add(key.toLowerCase(), value);
    });

    logger.debug('Final gRPC metadata keys:', Object.keys(metadata.getMap()));

    // Add client identification
    metadata.add('x-client-type', 'mcp-server');
    metadata.add('x-client-id', 'jauauth-mcp');
    
    return metadata;
  }

  async createMemory(request: CreateMemoryRequest): Promise<Memory> {
    const metadata = await this.createMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.createMemory({
        user_id: request.userId,
        content: request.content,
        context: request.context,
        importance: request.importance,
        tags: request.tags || [],
        metadata: request.metadata || {}
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('CreateMemory error:', error);
          reject(error);
        } else {
          resolve(this.protoToMemory(response));
        }
      });
    });
  }

  async recallMemories(request: RecallMemoriesRequest): Promise<RecallMemoriesResponse> {
    const metadata = await this.createMetadata();
    
    return new Promise((resolve, reject) => {
      const protoRequest: any = {
        user_id: request.userId,
        limit: request.limit || 20,
        min_importance: request.minImportance
      };

      // Only include query when provided — proto field is optional; omitting
      // it lets the backend run a filters-only search.
      if (request.query !== undefined && request.query !== '') {
        protoRequest.query = request.query;
      }

      // Map mode to proto enum
      if (request.mode) {
        const modeMap: Record<string, number> = {
          'keyword': 1,    // RECALL_MODE_KEYWORD
          'semantic': 2,   // RECALL_MODE_SEMANTIC
          'hybrid': 3      // RECALL_MODE_HYBRID
        };
        protoRequest.mode = modeMap[request.mode] || 1; // Default to keyword
      }

      if (request.tags?.length) {
        protoRequest.tags = request.tags;
      }

      if (request.fuzzyThreshold !== undefined) {
        protoRequest.fuzzy_threshold = request.fuzzyThreshold;
      }

      // Handle time range - support both formats
      if (request.timeRange || request.startDate || request.endDate) {
        protoRequest.time_range = {};

        // Use timeRange if provided, otherwise fall back to startDate/endDate
        const start = request.timeRange?.start || request.startDate;
        const end = request.timeRange?.end || request.endDate;

        if (start) {
          const startTimestamp = Math.floor(parseUserDate(start, 'start').getTime() / 1000);
          protoRequest.time_range.start = { seconds: startTimestamp, nanos: 0 };
        }
        if (end) {
          const endTimestamp = Math.floor(parseUserDate(end, 'end').getTime() / 1000);
          protoRequest.time_range.end = { seconds: endTimestamp, nanos: 0 };
        }
      }

      this.client.recallMemories(protoRequest, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('RecallMemories error:', error);
          reject(error);
        } else {
          resolve({
            results: response.results.map((r: any) => ({
              memory: this.protoToMemory(r.memory),
              relevanceScore: r.relevance_score,
              matchedTerms: r.matched_terms || []
            })),
            totalCount: response.total_count,
            nextPageToken: response.next_page_token
          });
        }
      });
    });
  }

  async updateMemory(id: string, userId: string, updates: Partial<Memory>): Promise<Memory> {
    const metadata = await this.createMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.updateMemory({
        id,
        user_id: userId,
        content: updates.content,
        context: updates.context,
        importance: updates.importance,
        tags: updates.tags,
        metadata: updates.metadata
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('UpdateMemory error:', error);
          reject(error);
        } else {
          resolve(this.protoToMemory(response));
        }
      });
    });
  }

  async deleteMemory(id: string, userId: string): Promise<void> {
    const metadata = await this.createMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.deleteMemory({
        id,
        user_id: userId
      }, metadata, (error: any) => {
        if (error) {
          logger.error('DeleteMemory error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async getMemory(id: string, userId: string): Promise<Memory> {
    const metadata = await this.createMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.getMemory({
        id,
        user_id: userId
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetMemory error:', error);
          reject(error);
        } else {
          resolve(this.protoToMemory(response));
        }
      });
    });
  }

  private protoToMemory(proto: any): Memory {
    const metadata = proto.metadata || {};

    // Parse indicators if it's a string
    if (metadata.indicators && typeof metadata.indicators === 'string') {
      try {
        metadata.indicators = JSON.parse(metadata.indicators);
      } catch (e) {
        // Leave as string if parsing fails
      }
    }

    return {
      id: proto.id,
      userId: proto.user_id,
      content: proto.content,
      context: proto.context,
      importance: proto.importance,
      memoryType: proto.memory_type || 'unknown',  // Now read directly from proto
      tags: proto.tags || [],
      createdAt: this.timestampToDate(proto.created_at),
      updatedAt: this.timestampToDate(proto.updated_at),
      accessCount: proto.access_count,
      embeddingId: proto.embedding_id,
      metadata: metadata
    };
  }

  private timestampToDate(timestamp: any): Date {
    if (!timestamp) return new Date();
    const seconds = Number(timestamp.seconds || 0);
    const nanos = Number(timestamp.nanos || 0);
    return new Date(seconds * 1000 + nanos / 1000000);
  }
}