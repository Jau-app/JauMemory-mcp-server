/**
 * Memory REST API Client
 *
 * Uses the production REST API endpoints instead of gRPC
 */
import axios from 'axios';
import { logger } from '../../utils/logger.js';
export class MemoryServiceClient {
    client;
    authManager;
    constructor(baseUrl, authManager) {
        this.authManager = authManager;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        logger.debug(`Connected to Memory Service REST API at ${baseUrl}`);
    }
    async getHeaders() {
        const authHeaders = await this.authManager.getAuthHeaders();
        return {
            ...authHeaders,
            'Content-Type': 'application/json'
        };
    }
    async createMemory(request) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post('/memories', {
                content: request.content,
                context: request.context,
                importance: request.importance,
                tags: request.tags || [],
                metadata: request.metadata || {}
            }, { headers });
            return this.transformMemory(response.data.data || response.data);
        }
        catch (error) {
            logger.error('CreateMemory REST error:', error);
            throw error;
        }
    }
    async recallMemories(request) {
        try {
            const headers = await this.getHeaders();
            // Use search endpoint if query is provided
            if (request.query && request.query.trim()) {
                const searchRequest = {
                    query: request.query,
                    mode: request.mode || 'keyword',
                    limit: request.limit || 20
                };
                // Add filters if provided
                const filters = {};
                let hasFilters = false;
                if (request.tags && request.tags.length > 0) {
                    filters.tags = request.tags;
                    hasFilters = true;
                }
                if (request.minImportance !== undefined) {
                    filters.importance_min = request.minImportance;
                    hasFilters = true;
                }
                if (request.startDate || request.endDate) {
                    filters.date_range = {};
                    if (request.startDate) {
                        filters.date_range.start = request.startDate.toISOString();
                    }
                    if (request.endDate) {
                        filters.date_range.end = request.endDate.toISOString();
                    }
                    hasFilters = true;
                }
                if (hasFilters) {
                    searchRequest.filters = filters;
                }
                logger.debug('Sending search request:', searchRequest);
                const response = await this.client.post('/memories/search', searchRequest, { headers });
                // Transform response
                const data = response.data.data || response.data;
                return {
                    results: (data.results || data.memories || []).map((item) => ({
                        memory: this.transformMemory(item.memory || item),
                        relevanceScore: item.relevance_score || item.score || 1.0,
                        matchedTerms: item.matched_terms || []
                    })),
                    totalCount: data.total_count || data.total || data.results?.length || 0,
                    nextPageToken: data.next_page_token
                };
            }
            else {
                // Use list endpoint
                const params = new URLSearchParams();
                params.append('limit', String(request.limit || 20));
                if (request.tags && request.tags.length > 0) {
                    params.append('tag', request.tags[0]);
                }
                const response = await this.client.get(`/memories?${params.toString()}`, { headers });
                const data = response.data.data || response.data;
                return {
                    results: (data.memories || data || []).map((memory) => ({
                        memory: this.transformMemory(memory),
                        relevanceScore: 1.0,
                        matchedTerms: []
                    })),
                    totalCount: data.total || data.length || 0,
                    nextPageToken: data.next_page_token
                };
            }
        }
        catch (error) {
            logger.error('RecallMemories REST error:', error);
            throw error;
        }
    }
    async updateMemory(id, _userId, updates) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.patch(`/memories/${id}`, {
                content: updates.content,
                context: updates.context,
                importance: updates.importance,
                tags: updates.tags,
                metadata: updates.metadata
            }, { headers });
            return this.transformMemory(response.data.data || response.data);
        }
        catch (error) {
            logger.error('UpdateMemory REST error:', error);
            throw error;
        }
    }
    async deleteMemory(id, _userId) {
        try {
            const headers = await this.getHeaders();
            await this.client.delete(`/memories/${id}`, { headers });
        }
        catch (error) {
            logger.error('DeleteMemory REST error:', error);
            throw error;
        }
    }
    // Methods for compatibility with gRPC interface
    async getMemory(id, _userId) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.get(`/memories/${id}`, { headers });
            return this.transformMemory(response.data.data || response.data);
        }
        catch (error) {
            logger.error('GetMemory REST error:', error);
            throw error;
        }
    }
    transformMemory(data) {
        return {
            id: data.id,
            userId: data.user_id || data.userId,
            content: data.content,
            context: data.context,
            importance: data.importance || 0.5,
            memoryType: data.memory_type || data.memoryType || 'general',
            tags: data.tags || [],
            createdAt: new Date(data.created_at || data.createdAt),
            updatedAt: new Date(data.updated_at || data.updatedAt),
            accessCount: data.access_count || data.accessCount || 0,
            embeddingId: data.embedding_id || data.embeddingId,
            metadata: data.metadata || {}
        };
    }
}
//# sourceMappingURL=memory.js.map