/**
 * Consolidation Service gRPC Client
 *
 * Handles memory consolidation operations via gRPC
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
const ConsolidationService = protoDescriptor.jaumemory.v1.ConsolidationService;
export class ConsolidationServiceClient {
    client;
    authManager;
    constructor(address, authManager, useTls = true) {
        this.authManager = authManager;
        // Create credentials
        const credentials = useTls
            ? grpc.credentials.createSsl()
            : grpc.credentials.createInsecure();
        // Create client
        this.client = new ConsolidationService(address, credentials);
        logger.info('ConsolidationServiceClient initialized', { address, useTls });
    }
    async getMetadata() {
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
    async consolidateMemories(request) {
        const metadata = await this.getMetadata();
        return new Promise((resolve, reject) => {
            this.client.consolidateMemories({
                strategy: {
                    similarity_threshold: request.strategy.similarity_threshold || 0.7,
                    min_group_size: request.strategy.min_group_size || 2,
                    archive_originals: request.strategy.archive_originals !== false
                },
                dry_run: request.dry_run || false
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('ConsolidateMemories error:', error);
                    reject(error);
                }
                else {
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
//# sourceMappingURL=consolidation.js.map