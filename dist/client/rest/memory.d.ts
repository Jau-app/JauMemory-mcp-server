/**
 * Memory REST API Client
 *
 * Uses the production REST API endpoints instead of gRPC
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
    constructor(baseUrl: string, authManager: AuthManager);
    private getHeaders;
    createMemory(request: CreateMemoryRequest): Promise<Memory>;
    recallMemories(request: RecallMemoriesRequest): Promise<RecallMemoriesResponse>;
    updateMemory(id: string, _userId: string, updates: Partial<Memory>): Promise<Memory>;
    deleteMemory(id: string, _userId: string): Promise<void>;
    getMemory(id: string, _userId: string): Promise<Memory>;
    private transformMemory;
}
//# sourceMappingURL=memory.d.ts.map