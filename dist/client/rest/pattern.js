/**
 * Pattern Analysis REST API Client
 *
 * Pattern analysis is integrated into the memory API
 */
import axios from 'axios';
import { logger } from '../../utils/logger.js';
export class PatternServiceClient {
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
        logger.debug(`Connected to Pattern Service REST API at ${baseUrl}`);
    }
    async getHeaders() {
        const authHeaders = await this.authManager.getAuthHeaders();
        return {
            ...authHeaders,
            'Content-Type': 'application/json'
        };
    }
    async analyzePatterns(_userId, timeRange = 'week', category) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post('/memories/analyze', {
                time_range: timeRange,
                category
            }, { headers });
            const data = response.data.data || response.data;
            return {
                patterns: data.patterns || [],
                insights: data.insights || [],
                recommendations: data.recommendations || [],
                statistics: {
                    totalMemories: data.total_memories || data.totalMemories || 0,
                    timeRange: data.time_range || timeRange,
                    dominantTypes: data.dominant_types || data.dominantTypes || {}
                }
            };
        }
        catch (error) {
            logger.error('AnalyzePatterns REST error:', error);
            throw error;
        }
    }
    async getMemoryStats(_userId, startDate, endDate) {
        try {
            const headers = await this.getHeaders();
            const params = new URLSearchParams();
            if (startDate)
                params.append('start_date', startDate);
            if (endDate)
                params.append('end_date', endDate);
            const response = await this.client.get(`/memories/stats?${params.toString()}`, { headers });
            return response.data.data || response.data;
        }
        catch (error) {
            logger.error('GetMemoryStats REST error:', error);
            throw error;
        }
    }
}
//# sourceMappingURL=pattern.js.map