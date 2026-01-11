/**
 * Pattern client factory for production
 */
import { PatternServiceClient } from '../grpc/clients/pattern.js';
import { AuthManager } from '../auth/AuthManager.js';
export declare function createPatternClient(authManager: AuthManager): Promise<PatternServiceClient>;
//# sourceMappingURL=pattern.d.ts.map