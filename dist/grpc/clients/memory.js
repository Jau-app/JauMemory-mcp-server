/**
 * Memory Service gRPC Client for Production
 *
 * Connects to the JauMemory cloud service with authentication and TLS
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
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
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const MemoryService = protoDescriptor.jaumemory.v1.MemoryService;
export class MemoryServiceClient {
    client;
    authManager;
    constructor(address, authManager, useTls = true) {
        // Create credentials
        const credentials = useTls
            ? grpc.credentials.createSsl()
            : grpc.credentials.createInsecure();
        this.client = new MemoryService(address, credentials);
        this.authManager = authManager;
        logger.debug(`Connected to Memory Service at ${address} (TLS: ${useTls})`);
    }
    async createMetadata() {
        const metadata = new grpc.Metadata();
        const authHeaders = await this.authManager.getAuthHeaders();
        logger.debug('Creating gRPC metadata with auth headers:', authHeaders);
        // Add auth headers
        Object.entries(authHeaders).forEach(([key, value]) => {
            metadata.add(key.toLowerCase(), value);
        });
        // Add client identification
        metadata.add('x-client-type', 'mcp-server');
        metadata.add('x-client-id', 'jauauth-mcp');
        logger.debug('Final gRPC metadata keys:', metadata.getMap());
        return metadata;
    }
    async createMemory(request) {
        const metadata = await this.createMetadata();
        return new Promise((resolve, reject) => {
            this.client.createMemory({
                user_id: request.userId,
                content: request.content,
                context: request.context,
                importance: request.importance,
                tags: request.tags || [],
                metadata: request.metadata || {}
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('CreateMemory error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToMemory(response));
                }
            });
        });
    }
    async recallMemories(request) {
        const metadata = await this.createMetadata();
        return new Promise((resolve, reject) => {
            const protoRequest = {
                user_id: request.userId,
                query: request.query,
                limit: request.limit || 20,
                min_importance: request.minImportance
            };
            // Map mode to proto enum
            if (request.mode) {
                const modeMap = {
                    'keyword': 1, // RECALL_MODE_KEYWORD
                    'semantic': 2, // RECALL_MODE_SEMANTIC
                    'hybrid': 3 // RECALL_MODE_HYBRID
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
                    const startDate = typeof start === 'string' ? new Date(start) : start;
                    const startTimestamp = Math.floor(startDate.getTime() / 1000);
                    protoRequest.time_range.start = {
                        seconds: startTimestamp,
                        nanos: 0
                    };
                }
                if (end) {
                    const endDate = typeof end === 'string' ? new Date(end) : end;
                    const endTimestamp = Math.floor(endDate.getTime() / 1000);
                    protoRequest.time_range.end = {
                        seconds: endTimestamp,
                        nanos: 0
                    };
                }
            }
            this.client.recallMemories(protoRequest, metadata, (error, response) => {
                if (error) {
                    logger.error('RecallMemories error:', error);
                    reject(error);
                }
                else {
                    resolve({
                        results: response.results.map((r) => ({
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
    async updateMemory(id, userId, updates) {
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
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('UpdateMemory error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToMemory(response));
                }
            });
        });
    }
    async deleteMemory(id, userId) {
        const metadata = await this.createMetadata();
        return new Promise((resolve, reject) => {
            this.client.deleteMemory({
                id,
                user_id: userId
            }, metadata, (error) => {
                if (error) {
                    logger.error('DeleteMemory error:', error);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async getMemory(id, userId) {
        const metadata = await this.createMetadata();
        return new Promise((resolve, reject) => {
            this.client.getMemory({
                id,
                user_id: userId
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('GetMemory error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToMemory(response));
                }
            });
        });
    }
    protoToMemory(proto) {
        const metadata = proto.metadata || {};
        // Parse indicators if it's a string
        if (metadata.indicators && typeof metadata.indicators === 'string') {
            try {
                metadata.indicators = JSON.parse(metadata.indicators);
            }
            catch (e) {
                // Leave as string if parsing fails
            }
        }
        return {
            id: proto.id,
            userId: proto.user_id,
            content: proto.content,
            context: proto.context,
            importance: proto.importance,
            memoryType: metadata.memory_type || 'unknown',
            tags: proto.tags || [],
            createdAt: this.timestampToDate(proto.created_at),
            updatedAt: this.timestampToDate(proto.updated_at),
            accessCount: proto.access_count,
            embeddingId: proto.embedding_id,
            metadata: metadata
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
//# sourceMappingURL=memory.js.map