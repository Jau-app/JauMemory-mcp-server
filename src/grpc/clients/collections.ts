/**
 * Collections Service gRPC Client
 * 
 * Connects to the Rust backend collections service for managing memory collections
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
const PROTO_PATH = path.join(__dirname, '../../../proto/collections.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [path.join(__dirname, '../../../proto')]
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const CollectionService = protoDescriptor.jaumemory.v1.CollectionService;

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description?: string;
  memoryCount: number;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionMemory {
  id: string;
  content: string;
  memoryType: string;
  importance: number;
  tags: string[];
  addedAt: Date;
}

export interface CollectionWithMemories extends Collection {
  memories: CollectionMemory[];
}

export interface CreateCollectionRequest {
  name: string;
  description?: string;
  memoryIds?: string[];
}

export interface ListCollectionsResponse {
  collections: Collection[];
  totalCount: number;
}

export interface ConsolidateCollectionResponse {
  memoryId?: string;
  summary?: string;
  memoriesConsolidated: number;
  success: boolean;
  message?: string;
}

export class CollectionsServiceClient {
  private client: any;
  private authManager: AuthManager;
  
  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    const credentials = buildCredentials(useTls);
    
    this.client = new CollectionService(address, credentials);
    this.authManager = authManager;
    
    logger.info(`Connected to Collections Service at ${address} (TLS: ${useTls})`);
  }
  
  private async getMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const authHeaders = await this.authManager.getAuthHeaders();
    
    // Add auth headers
    Object.entries(authHeaders).forEach(([key, value]) => {
      metadata.add(key.toLowerCase(), value);
    });
    
    // Add client identification
    metadata.add('x-client-type', 'mcp-server');
    metadata.add('x-client-id', 'jaumemory-collections-mcp');
    
    return metadata;
  }

  async createCollection(request: CreateCollectionRequest): Promise<Collection> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.createCollection({
        name: request.name,
        description: request.description,
        memory_ids: request.memoryIds || []
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('CreateCollection error:', error);
          reject(error);
        } else {
          resolve(this.protoToCollection(response));
        }
      });
    });
  }

  async listCollections(): Promise<ListCollectionsResponse> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.listCollections({
        limit: 100,
        offset: 0,
        sort_by: 'created_at',
        sort_desc: true
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('ListCollections error:', error);
          reject(error);
        } else {
          resolve({
            collections: response.collections.map((c: any) => this.protoToCollection(c)),
            totalCount: response.total
          });
        }
      });
    });
  }

  async getCollection(collectionId: string): Promise<CollectionWithMemories> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.getCollectionWithMemories({
        collection_id: collectionId
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetCollection error:', error);
          reject(error);
        } else {
          resolve(this.protoToCollectionWithMemories(response));
        }
      });
    });
  }

  async addMemoryToCollection(collectionId: string, memoryId: string): Promise<void> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.addMemoryToCollection({
        collection_id: collectionId,
        memory_id: memoryId
      }, metadata, (error: any) => {
        if (error) {
          logger.error('AddMemoryToCollection error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async removeMemoryFromCollection(collectionId: string, memoryId: string): Promise<void> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.removeMemoryFromCollection({
        collection_id: collectionId,
        memory_id: memoryId
      }, metadata, (error: any) => {
        if (error) {
          logger.error('RemoveMemoryFromCollection error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async updateCollection(collectionId: string, updates: { name?: string; description?: string }): Promise<Collection> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.updateCollection({
        collection_id: collectionId,
        name: updates.name,
        description: updates.description
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('UpdateCollection error:', error);
          reject(error);
        } else {
          resolve(this.protoToCollection(response));
        }
      });
    });
  }

  async deleteCollection(collectionId: string): Promise<void> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.deleteCollection({
        collection_id: collectionId
      }, metadata, (error: any) => {
        if (error) {
          logger.error('DeleteCollection error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async consolidateCollection(collectionId: string, options: { summarizeOnly?: boolean; title?: string }): Promise<ConsolidateCollectionResponse> {
    const metadata = await this.getMetadata();
    
    return new Promise((resolve, reject) => {
      this.client.consolidateCollection({
        collection_id: collectionId,
        summarize_only: options.summarizeOnly || false,
        title: options.title
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('ConsolidateCollection error:', error);
          reject(error);
        } else {
          resolve({
            memoryId: response.consolidated_memory_id,
            summary: response.summary,
            memoriesConsolidated: response.memories_consolidated,
            success: response.success,
            message: response.message
          });
        }
      });
    });
  }

  private protoToCollection(proto: any): Collection {
    return {
      id: proto.id,
      userId: proto.user_id,
      name: proto.name,
      description: proto.description || '',
      memoryCount: Number(proto.memory_count || 0),
      isPublic: proto.is_public || false,
      createdAt: this.timestampToDate(proto.created_at),
      updatedAt: this.timestampToDate(proto.updated_at)
    };
  }

  private protoToCollectionWithMemories(proto: any): CollectionWithMemories {
    return {
      id: proto.id,
      userId: proto.user_id,
      name: proto.name,
      description: proto.description || '',
      memoryCount: Number(proto.memory_count || 0),
      isPublic: proto.is_public || false,
      createdAt: this.timestampToDate(proto.created_at),
      updatedAt: this.timestampToDate(proto.updated_at),
      memories: (proto.memories || []).map((m: any) => ({
        id: m.id,
        content: m.content,
        memoryType: m.memory_type,
        importance: m.importance,
        tags: m.tags || [],
        addedAt: this.timestampToDate(m.added_at)
      }))
    };
  }

  private timestampToDate(timestamp: any): Date {
    if (!timestamp) return new Date();
    const seconds = Number(timestamp.seconds || 0);
    const nanos = Number(timestamp.nanos || 0);
    return new Date(seconds * 1000 + nanos / 1000000);
  }
}