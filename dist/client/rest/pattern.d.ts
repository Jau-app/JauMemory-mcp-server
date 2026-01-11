/**
 * Pattern Analysis REST API Client
 *
 * Pattern analysis is integrated into the memory API
 */
import { AuthManager } from '../../auth/AuthManager.js';
export interface PatternAnalysis {
    patterns: Array<{
        type: string;
        confidence: number;
        description: string;
        relatedMemories: string[];
    }>;
    insights: string[];
    recommendations: string[];
    statistics: {
        totalMemories: number;
        timeRange: string;
        dominantTypes: Record<string, number>;
    };
}
export declare class PatternServiceClient {
    private client;
    private authManager;
    constructor(baseUrl: string, authManager: AuthManager);
    private getHeaders;
    analyzePatterns(_userId: string, timeRange?: string, category?: string): Promise<PatternAnalysis>;
    getMemoryStats(_userId: string, startDate?: string, endDate?: string): Promise<any>;
}
//# sourceMappingURL=pattern.d.ts.map