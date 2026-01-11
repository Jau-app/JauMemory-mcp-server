/**
 * Collections REST API Client
 */
import { AuthManager } from '../../auth/AuthManager.js';
import { Memory } from './memory.js';
export interface Collection {
    id: string;
    userId: string;
    name: string;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
    memoryCount?: number;
    metadata?: Record<string, any>;
}
export interface CollectionWithMemories extends Collection {
    memories: Memory[];
}
export interface CreateCollectionRequest {
    userId: string;
    name: string;
    description?: string;
    memoryIds?: string[];
}
export interface UpdateCollectionRequest {
    name?: string;
    description?: string;
}
export interface CollectionStats {
    totalMemories: number;
    memoryTypes: Record<string, number>;
    averageImportance: number;
    dateRange?: {
        earliest: Date;
        latest: Date;
    };
    topTags: Array<{
        tag: string;
        count: number;
    }>;
}
export declare class CollectionsServiceClient {
    private client;
    private authManager;
    constructor(baseUrl: string, authManager: AuthManager);
    private getHeaders;
    createCollection(request: CreateCollectionRequest): Promise<Collection>;
    listCollections(_userId: string): Promise<Collection[]>;
    getCollection(collectionId: string): Promise<Collection>;
    getCollectionWithMemories(collectionId: string): Promise<CollectionWithMemories>;
    updateCollection(collectionId: string, request: UpdateCollectionRequest): Promise<Collection>;
    deleteCollection(collectionId: string): Promise<void>;
    addMemoryToCollection(collectionId: string, memoryId: string): Promise<void>;
    removeMemoryFromCollection(collectionId: string, memoryId: string): Promise<void>;
    getCollectionStats(collectionId: string): Promise<CollectionStats>;
    consolidateCollection(collectionId: string, summarizeOnly?: boolean, title?: string): Promise<Memory>;
    private transformCollection;
    private transformMemory;
}
//# sourceMappingURL=collections.d.ts.map