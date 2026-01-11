/**
 * Collections Service gRPC Client
 *
 * Connects to the Rust backend collections service for managing memory collections
 */
import { AuthManager } from '../../auth/AuthManager.js';
export interface Collection {
    id: string;
    userId: string;
    name: string;
    description?: string;
    memoryCount: number;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface CollectionMemory {
    id: string;
    content: string;
    memoryType: string;
    importance: number;
    tags: string[];
    addedAt: Date;
}
export interface CollectionWithMemories extends Collection {
    memories: CollectionMemory[];
}
export interface CreateCollectionRequest {
    name: string;
    description?: string;
    memoryIds?: string[];
}
export interface ListCollectionsResponse {
    collections: Collection[];
    totalCount: number;
}
export interface ConsolidateCollectionResponse {
    memoryId?: string;
    summary?: string;
    memoriesConsolidated: number;
    success: boolean;
    message?: string;
}
export declare class CollectionsServiceClient {
    private client;
    private authManager;
    constructor(address: string, authManager: AuthManager, useTls?: boolean);
    private getMetadata;
    createCollection(request: CreateCollectionRequest): Promise<Collection>;
    listCollections(): Promise<ListCollectionsResponse>;
    getCollection(collectionId: string): Promise<CollectionWithMemories>;
    addMemoryToCollection(collectionId: string, memoryId: string): Promise<void>;
    removeMemoryFromCollection(collectionId: string, memoryId: string): Promise<void>;
    updateCollection(collectionId: string, updates: {
        name?: string;
        description?: string;
    }): Promise<Collection>;
    deleteCollection(collectionId: string): Promise<void>;
    consolidateCollection(collectionId: string, options: {
        summarizeOnly?: boolean;
        title?: string;
    }): Promise<ConsolidateCollectionResponse>;
    private protoToCollection;
    private protoToCollectionWithMemories;
    private timestampToDate;
}
//# sourceMappingURL=collections.d.ts.map