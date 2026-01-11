/**
 * Memory Service gRPC Client for Production
 *
 * Connects to the JauMemory cloud service with authentication and TLS
 */
import { AuthManager } from '../../auth/AuthManager.js';
export interface CreateMemoryRequest {
    userId: string;
    content: string;
    context?: string;
    importance?: number;
    tags?: string[];
    metadata?: Record<string, string>;
}
export interface Memory {
    id: string;
    userId: string;
    content: string;
    context?: string;
    importance: number;
    memoryType?: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    accessCount: number;
    embeddingId?: string;
    metadata: Record<string, any>;
}
export interface RecallMemoriesRequest {
    userId: string;
    query: string;
    mode?: 'keyword' | 'semantic' | 'hybrid';
    limit?: number;
    minImportance?: number;
    tags?: string[];
    startDate?: Date;
    endDate?: Date;
    timeRange?: {
        start?: Date | string;
        end?: Date | string;
    };
    fuzzyThreshold?: number;
}
export interface MemoryResult {
    memory: Memory;
    relevanceScore: number;
    matchedTerms: string[];
}
export interface RecallMemoriesResponse {
    results: MemoryResult[];
    totalCount: number;
    nextPageToken?: string;
}
export declare class MemoryServiceClient {
    private client;
    private authManager;
    constructor(address: string, authManager: AuthManager, useTls?: boolean);
    private createMetadata;
    createMemory(request: CreateMemoryRequest): Promise<Memory>;
    recallMemories(request: RecallMemoriesRequest): Promise<RecallMemoriesResponse>;
    updateMemory(id: string, userId: string, updates: Partial<Memory>): Promise<Memory>;
    deleteMemory(id: string, userId: string): Promise<void>;
    getMemory(id: string, userId: string): Promise<Memory>;
    private protoToMemory;
    private timestampToDate;
}
//# sourceMappingURL=memory.d.ts.map