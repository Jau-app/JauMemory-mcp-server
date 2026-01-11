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
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const PatternService = protoDescriptor.jaumemory.v1.PatternService;
export class PatternServiceClient {
    client;
    authManager;
    constructor(address, authManager, useTls = true) {
        // Create credentials
        const credentials = useTls
            ? grpc.credentials.createSsl()
            : grpc.credentials.createInsecure();
        this.client = new PatternService(address, credentials);
        this.authManager = authManager;
        logger.debug(`Connected to Pattern Service at ${address} (TLS: ${useTls})`);
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
    async analyzePatterns(request) {
        const metadata = await this.createMetadata();
        return new Promise((resolve, reject) => {
            const protoRequest = {
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
            this.client.analyzePatterns(protoRequest, metadata, (error, response) => {
                if (error) {
                    logger.error('AnalyzePatterns error:', error);
                    reject(error);
                }
                else {
                    resolve({
                        patterns: (response.patterns || []).map((p) => this.protoToPattern(p)),
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
    protoToPattern(proto) {
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
    timestampToDate(timestamp) {
        if (!timestamp)
            return new Date();
        const seconds = Number(timestamp.seconds || 0);
        const nanos = Number(timestamp.nanos || 0);
        return new Date(seconds * 1000 + nanos / 1000000);
    }
    async getMemoryStats(request) {
        const metadata = await this.createMetadata();
        return new Promise((resolve, reject) => {
            const protoRequest = {
                query: request.query,
                tags: request.tags || [],
                min_importance: request.minImportance,
                start_date: request.startDate,
                end_date: request.endDate
            };
            this.client.getMemoryStats(protoRequest, metadata, (error, response) => {
                if (error) {
                    logger.error('GetMemoryStats error:', error);
                    reject(error);
                }
                else {
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
//# sourceMappingURL=pattern.js.map