/**
 * Pattern Service gRPC Client for Production
 * 
 * Connects to the JauMemory cloud service for pattern analysis
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { redactSecrets } from '../../utils/redaction.js';
import { AuthManager } from '../../auth/AuthManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load proto file
const PROTO_PATH = path.join(__dirname, '../../../proto/pattern.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [path.join(__dirname, '../../../proto')]
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const PatternService = protoDescriptor.jaumemory.v1.PatternService;

export interface Pattern {
  id: string;
  userId: string;
  patternType: string;
  name: string;
  description: string;
  confidence: number;
  occurrenceCount: number;
  exampleMemoryIds: string[];
  relatedMemoryIds: string[];
  metadata: Record<string, string>;
  firstSeen: Date;
  lastSeen: Date;
  createdAt: Date;
}

export interface AnalyzePatternsRequest {
  userId: string;
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  patternTypes?: string[];
  minOccurrences?: number;
  minConfidence?: number;
}

export interface AnalyzePatternsResponse {
  patterns: Pattern[];
  summary: {
    totalPatterns: number;
    patternsByType: Record<string, number>;
    dominantTopics: string[];
    overallConsistency: number;
  };
  insights: string[];
  totalMemoriesAnalyzed: number;
}

export class PatternServiceClient {
  private client: any;
  private authManager: AuthManager;
  
  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    // Create credentials
    const credentials = useTls 
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();
    
    this.client = new PatternService(address, credentials);
    this.authManager = authManager;
    
    logger.debug(`Connected to Pattern Service at ${address} (TLS: ${useTls})`);
  }
  
  private async createMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const authHeaders = await this.authManager.getAuthHeaders();
    
    logger.debug('Creating gRPC metadata with auth headers:', redactSecrets(authHeaders));

    // Add auth headers
    Object.entries(authHeaders).forEach(([key, value]) => {
      metadata.add(key.toLowerCase(), value);
    });

    // Add client identification
    metadata.add('x-client-type', 'mcp-server');
    metadata.add('x-client-id', 'jauauth-mcp');

    logger.debug('Final gRPC metadata keys:', Object.keys(metadata.getMap()));

    return metadata;
  }

  async analyzePatterns(request: AnalyzePatternsRequest): Promise<AnalyzePatternsResponse> {
    const metadata = await this.createMetadata();
    
    return new Promise((resolve, reject) => {
      const protoRequest: any = {
        user_id: request.userId
      };

      // Add optional time range
      if (request.timeRange) {
        protoRequest.time_range = {};
        
        if (request.timeRange.start) {
          const startTimestamp = Math.floor(request.timeRange.start.getTime() / 1000);
          protoRequest.time_range.start = {
            seconds: startTimestamp,
            nanos: 0
          };
        }
        if (request.timeRange.end) {
          const endTimestamp = Math.floor(request.timeRange.end.getTime() / 1000);
          protoRequest.time_range.end = {
            seconds: endTimestamp,
            nanos: 0
          };
        }
      }

      if (request.minOccurrences !== undefined) {
        protoRequest.min_occurrences = request.minOccurrences;
      }

      if (request.minConfidence !== undefined) {
        protoRequest.min_confidence = request.minConfidence;
      }

      this.client.analyzePatterns(protoRequest, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('AnalyzePatterns error:', error);
          reject(error);
        } else {
          resolve({
            patterns: (response.patterns || []).map((p: any) => this.protoToPattern(p)),
            summary: {
              totalPatterns: response.summary?.total_patterns || 0,
              patternsByType: response.summary?.patterns_by_type || {},
              dominantTopics: response.summary?.dominant_topics || [],
              overallConsistency: response.summary?.overall_consistency || 0
            },
            insights: response.insights || [],
            totalMemoriesAnalyzed: response.total_memories_analyzed || 0
          });
        }
      });
    });
  }

  private protoToPattern(proto: any): Pattern {
    return {
      id: proto.id,
      userId: proto.user_id,
      patternType: proto.pattern_type,
      name: proto.name,
      description: proto.description,
      confidence: proto.confidence,
      occurrenceCount: proto.occurrence_count || proto.occurrences || 0,
      exampleMemoryIds: proto.example_memory_ids || [],
      relatedMemoryIds: proto.related_memory_ids || [],
      metadata: proto.metadata || {},
      firstSeen: this.timestampToDate(proto.first_seen),
      lastSeen: this.timestampToDate(proto.last_seen),
      createdAt: this.timestampToDate(proto.created_at)
    };
  }

  private timestampToDate(timestamp: any): Date {
    if (!timestamp) return new Date();
    const seconds = Number(timestamp.seconds || 0);
    const nanos = Number(timestamp.nanos || 0);
    return new Date(seconds * 1000 + nanos / 1000000);
  }

  async getMemoryStats(request: any): Promise<any> {
    const metadata = await this.createMetadata();
    
    return new Promise((resolve, reject) => {
      const protoRequest: any = {
        query: request.query,
        tags: request.tags || [],
        min_importance: request.minImportance,
        start_date: request.startDate,
        end_date: request.endDate
      };

      this.client.getMemoryStats(protoRequest, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetMemoryStats error:', error);
          reject(error);
        } else {
          // Convert proto response to JS format
          resolve({
            totalCount: response.total_count,
            memoriesByType: response.memories_by_type || {},
            topTags: response.top_tags || [],
            memoriesByImportance: response.memories_by_importance || {},
            keywordFrequency: response.keyword_frequency || []
          });
        }
      });
    });
  }
}