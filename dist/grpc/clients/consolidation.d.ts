/**
 * Consolidation Service gRPC Client
 *
 * Handles memory consolidation operations via gRPC
 */
import { AuthManager } from '../../auth/AuthManager.js';
export interface ConsolidationStrategy {
    similarity_threshold?: number;
    min_group_size?: number;
    archive_originals?: boolean;
}
export interface ConsolidateRequest {
    strategy: ConsolidationStrategy;
    dry_run?: boolean;
}
export interface ConsolidateResponse {
    memories_affected: number;
    consolidations_performed: any[];
    insights_generated: any[];
    space_saved?: number;
}
export declare class ConsolidationServiceClient {
    private client;
    private authManager;
    constructor(address: string, authManager: AuthManager, useTls?: boolean);
    private getMetadata;
    consolidateMemories(request: ConsolidateRequest): Promise<ConsolidateResponse>;
}
//# sourceMappingURL=consolidation.d.ts.map