/**
 * Consolidation REST API Client
 *
 * Handles memory consolidation via REST API
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
    constructor(baseUrl: string, authManager: AuthManager);
    private getHeaders;
    consolidateMemories(request: ConsolidateRequest): Promise<ConsolidateResponse>;
}
//# sourceMappingURL=consolidation.d.ts.map