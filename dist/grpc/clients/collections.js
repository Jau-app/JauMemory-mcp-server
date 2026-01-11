/**
 * Collections Service gRPC Client
 *
 * Connects to the Rust backend collections service for managing memory collections
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
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
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const CollectionService = protoDescriptor.jaumemory.v1.CollectionService;
export class CollectionsServiceClient {
    client;
    authManager;
    constructor(address, authManager, useTls = true) {
        const credentials = useTls
            ? grpc.credentials.createSsl()
            : grpc.credentials.createInsecure();
        this.client = new CollectionService(address, credentials);
        this.authManager = authManager;
        logger.info(`Connected to Collections Service at ${address} (TLS: ${useTls})`);
    }
    async getMetadata() {
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
    async createCollection(request) {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.createCollection({
                name: request.name,
                description: request.description,
                memory_ids: request.memoryIds || []
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('CreateCollection error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToCollection(response));
                }
            });
        });
    }
    async listCollections() {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.listCollections({
                limit: 100,
                offset: 0,
                sort_by: 'created_at',
                sort_desc: true
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('ListCollections error:', error);
                    reject(error);
                }
                else {
                    resolve({
                        collections: response.collections.map((c) => this.protoToCollection(c)),
                        totalCount: response.total
                    });
                }
            });
        });
    }
    async getCollection(collectionId) {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.getCollectionWithMemories({
                collection_id: collectionId
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('GetCollection error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToCollectionWithMemories(response));
                }
            });
        });
    }
    async addMemoryToCollection(collectionId, memoryId) {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.addMemoryToCollection({
                collection_id: collectionId,
                memory_id: memoryId
            }, metadata, (error) => {
                if (error) {
                    logger.error('AddMemoryToCollection error:', error);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async removeMemoryFromCollection(collectionId, memoryId) {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.removeMemoryFromCollection({
                collection_id: collectionId,
                memory_id: memoryId
            }, metadata, (error) => {
                if (error) {
                    logger.error('RemoveMemoryFromCollection error:', error);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async updateCollection(collectionId, updates) {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.updateCollection({
                collection_id: collectionId,
                name: updates.name,
                description: updates.description
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('UpdateCollection error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToCollection(response));
                }
            });
        });
    }
    async deleteCollection(collectionId) {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.deleteCollection({
                collection_id: collectionId
            }, metadata, (error) => {
                if (error) {
                    logger.error('DeleteCollection error:', error);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async consolidateCollection(collectionId, options) {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.consolidateCollection({
                collection_id: collectionId,
                summarize_only: options.summarizeOnly || false,
                title: options.title
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('ConsolidateCollection error:', error);
                    reject(error);
                }
                else {
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
    protoToCollection(proto) {
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
    protoToCollectionWithMemories(proto) {
        return {
            id: proto.id,
            userId: proto.user_id,
            name: proto.name,
            description: proto.description || '',
            memoryCount: Number(proto.memory_count || 0),
            isPublic: proto.is_public || false,
            createdAt: this.timestampToDate(proto.created_at),
            updatedAt: this.timestampToDate(proto.updated_at),
            memories: (proto.memories || []).map((m) => ({
                id: m.id,
                content: m.content,
                memoryType: m.memory_type,
                importance: m.importance,
                tags: m.tags || [],
                addedAt: this.timestampToDate(m.added_at)
            }))
        };
    }
    timestampToDate(timestamp) {
        if (!timestamp)
            return new Date();
        const seconds = Number(timestamp.seconds || 0);
        const nanos = Number(timestamp.nanos || 0);
        return new Date(seconds * 1000 + nanos / 1000000);
    }
}
//# sourceMappingURL=collections.js.map