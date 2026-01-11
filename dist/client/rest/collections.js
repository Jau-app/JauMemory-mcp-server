/**
 * Collections REST API Client
 */
import axios from 'axios';
import { logger } from '../../utils/logger.js';
export class CollectionsServiceClient {
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
        logger.debug(`Connected to Collections Service REST API at ${baseUrl}`);
    }
    async getHeaders() {
        const authHeaders = await this.authManager.getAuthHeaders();
        return {
            ...authHeaders,
            'Content-Type': 'application/json'
        };
    }
    async createCollection(request) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post('/collections', {
                name: request.name,
                description: request.description,
                memory_ids: request.memoryIds || []
            }, { headers });
            return this.transformCollection(response.data.data || response.data);
        }
        catch (error) {
            logger.error('CreateCollection REST error:', error);
            throw error;
        }
    }
    async listCollections(_userId) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.get('/collections', { headers });
            const data = response.data.data || response.data;
            return (data.collections || data || []).map((c) => this.transformCollection(c));
        }
        catch (error) {
            logger.error('ListCollections REST error:', error);
            throw error;
        }
    }
    async getCollection(collectionId) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.get(`/collections/${collectionId}`, { headers });
            return this.transformCollection(response.data.data || response.data);
        }
        catch (error) {
            logger.error('GetCollection REST error:', error);
            throw error;
        }
    }
    async getCollectionWithMemories(collectionId) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.get(`/collections/${collectionId}/memories`, { headers });
            const data = response.data.data || response.data;
            return {
                ...this.transformCollection(data.collection || data),
                memories: (data.memories || []).map((m) => this.transformMemory(m))
            };
        }
        catch (error) {
            logger.error('GetCollectionWithMemories REST error:', error);
            throw error;
        }
    }
    async updateCollection(collectionId, request) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.put(`/collections/${collectionId}`, request, { headers });
            return this.transformCollection(response.data.data || response.data);
        }
        catch (error) {
            logger.error('UpdateCollection REST error:', error);
            throw error;
        }
    }
    async deleteCollection(collectionId) {
        try {
            const headers = await this.getHeaders();
            await this.client.delete(`/collections/${collectionId}`, { headers });
        }
        catch (error) {
            logger.error('DeleteCollection REST error:', error);
            throw error;
        }
    }
    async addMemoryToCollection(collectionId, memoryId) {
        try {
            const headers = await this.getHeaders();
            await this.client.post(`/collections/${collectionId}/memories`, {
                memory_id: memoryId
            }, { headers });
        }
        catch (error) {
            logger.error('AddMemoryToCollection REST error:', error);
            throw error;
        }
    }
    async removeMemoryFromCollection(collectionId, memoryId) {
        try {
            const headers = await this.getHeaders();
            await this.client.delete(`/collections/${collectionId}/memories/${memoryId}`, { headers });
        }
        catch (error) {
            logger.error('RemoveMemoryFromCollection REST error:', error);
            throw error;
        }
    }
    async getCollectionStats(collectionId) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.get(`/collections/${collectionId}/stats`, { headers });
            const data = response.data.data || response.data;
            return {
                totalMemories: data.total_memories || data.totalMemories || 0,
                memoryTypes: data.memory_types || data.memoryTypes || {},
                averageImportance: data.average_importance || data.averageImportance || 0.5,
                dateRange: data.date_range ? {
                    earliest: new Date(data.date_range.earliest),
                    latest: new Date(data.date_range.latest)
                } : undefined,
                topTags: data.top_tags || data.topTags || []
            };
        }
        catch (error) {
            logger.error('GetCollectionStats REST error:', error);
            throw error;
        }
    }
    async consolidateCollection(collectionId, summarizeOnly, title) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post(`/collections/${collectionId}/consolidate`, {
                summarize_only: summarizeOnly,
                title
            }, { headers });
            return this.transformMemory(response.data.data || response.data);
        }
        catch (error) {
            logger.error('ConsolidateCollection REST error:', error);
            throw error;
        }
    }
    transformCollection(data) {
        return {
            id: data.id,
            userId: data.user_id || data.userId,
            name: data.name,
            description: data.description,
            createdAt: new Date(data.created_at || data.createdAt),
            updatedAt: new Date(data.updated_at || data.updatedAt),
            memoryCount: data.memory_count || data.memoryCount,
            metadata: data.metadata
        };
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
//# sourceMappingURL=collections.js.map