/**
 * Pattern Service gRPC Client for Production
 *
 * Connects to the JauMemory cloud service for pattern analysis
 */
import { AuthManager } from '../../auth/AuthManager.js';
export interface Pattern {
    id: string;
    userId: string;
    patternType: string;
    name: string;
    description: string;
    confidence: number;
    occurrenceCount: number;
    exampleMemoryIds: string[];
    relatedMemoryIds: string[];
    metadata: Record<string, string>;
    firstSeen: Date;
    lastSeen: Date;
    createdAt: Date;
}
export interface AnalyzePatternsRequest {
    userId: string;
    timeRange?: {
        start?: Date;
        end?: Date;
    };
    patternTypes?: string[];
    minOccurrences?: number;
    minConfidence?: number;
}
export interface AnalyzePatternsResponse {
    patterns: Pattern[];
    summary: {
        totalPatterns: number;
        patternsByType: Record<string, number>;
        dominantTopics: string[];
        overallConsistency: number;
    };
    insights: string[];
    totalMemoriesAnalyzed: number;
}
export declare class PatternServiceClient {
    private client;
    private authManager;
    constructor(address: string, authManager: AuthManager, useTls?: boolean);
    private createMetadata;
    analyzePatterns(request: AnalyzePatternsRequest): Promise<AnalyzePatternsResponse>;
    private protoToPattern;
    private timestampToDate;
    getMemoryStats(request: any): Promise<any>;
}
//# sourceMappingURL=pattern.d.ts.map