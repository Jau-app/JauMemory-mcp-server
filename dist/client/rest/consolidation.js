/**
 * Consolidation REST API Client
 *
 * Handles memory consolidation via REST API
 */
import axios from 'axios';
import { logger } from '../../utils/logger.js';
export class ConsolidationServiceClient {
    client;
    authManager;
    constructor(baseUrl, authManager) {
        this.authManager = authManager;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 60000, // Longer timeout for consolidation operations
            headers: {
                'Content-Type': 'application/json'
            }
        });
        logger.debug(`Connected to Consolidation Service REST API at ${baseUrl}`);
    }
    async getHeaders() {
        const authHeaders = await this.authManager.getAuthHeaders();
        return {
            ...authHeaders,
            'Content-Type': 'application/json'
        };
    }
    async consolidateMemories(request) {
        try {
            const headers = await this.getHeaders();
            // The REST API endpoint for consolidation
            const response = await this.client.post('/memories/consolidate', {
                similarity_threshold: request.strategy.similarity_threshold || 0.7,
                min_group_size: request.strategy.min_group_size || 2,
                archive_originals: request.strategy.archive_originals !== false,
                dry_run: request.dry_run || false,
                connection_depth: 1 // Default connection depth
            }, { headers });
            const data = response.data.data || response.data;
            return {
                memories_affected: data.memories_affected || data.total_memories || 0,
                consolidations_performed: data.consolidations || data.consolidations_performed || [],
                insights_generated: data.insights || data.insights_generated || [],
                space_saved: data.space_saved
            };
        }
        catch (error) {
            logger.error('ConsolidateMemories REST error:', error);
            throw error;
        }
    }
}
//# sourceMappingURL=consolidation.js.map