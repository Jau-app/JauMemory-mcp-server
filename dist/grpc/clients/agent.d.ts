/**
 * Agent Service gRPC Client
 *
 * Connects to the Rust backend agent service for multi-agent memory management
 */
import { AuthManager } from '../../auth/AuthManager.js';
export interface Agent {
    id: string;
    name: string;
    personalityTraits: string[];
    specializations: string[];
    status: 'active' | 'learning' | 'error' | 'archived';
    createdBy: string;
    createdAt: Date;
    updatePrompts?: string[];
    successCount?: number;
    errorCount?: number;
    learningRate?: number;
    collaborationCount?: number;
    lastErrorAt?: Date;
    lastSuccessAt?: Date;
}
export interface CreateAgentRequest {
    name: string;
    personalityTraits?: string[];
    specializations?: string[];
    updatePrompts?: string[];
    createdBy: string;
    id?: string;
    initialLearningRate?: number;
}
export interface AgentMemoryRequest {
    agentId: string;
    content: string;
    category?: string;
    projectContext?: string;
    metadata?: Record<string, string>;
}
export interface AgentRecallRequest {
    agentId: string;
    query?: string;
    category?: string;
    projectContext?: string;
    limit?: number;
}
export interface ErrorLearningRequest {
    agentId: string;
    errorSignature: string;
    errorMessage: string;
    contextSnapshot?: string;
    attemptedSolution?: string;
    projectContext?: string;
}
export interface ErrorSolutionRequest {
    agentId: string;
    patternId: string;
    solution: string;
    verificationSteps?: string[];
}
export interface ReflectionRequest {
    agentId: string;
    reflectionType: 'learning' | 'mistake' | 'success' | 'collaboration';
    content: string;
    lessonsLearned?: string[];
    relatedAgents?: string[];
}
export interface ErrorLearningResponse {
    type: 'first_occurrence' | 'solution_found' | 'previous_attempts_failed' | 'new_problem';
    patternId?: string;
    solution?: string;
    previousAttempts?: number;
    lastAttemptedAt?: Date;
    verificationSteps?: string[];
    similarPatternsCount?: number;
}
export interface AgentMemory {
    agentId: string;
    memoryId: string;
    memory?: any;
    category: string;
    projectContext?: string;
    createdAt: Date;
}
export interface Reflection {
    id: string;
    agentId: string;
    reflectionType: string;
    content: string;
    lessonsLearned: string[];
    collaborationNotes?: Record<string, string>;
    createdAt: Date;
}
export declare class AgentServiceClient {
    private client;
    private authManager;
    constructor(address: string, authManager: AuthManager, useTls?: boolean);
    private getMetadata;
    createAgent(request: CreateAgentRequest): Promise<Agent>;
    getAgent(agentId: string): Promise<Agent>;
    updateAgent(agentId: string, status?: string, updatePrompts?: string[]): Promise<Agent>;
    updateAgentName(agentId: string, newName: string): Promise<Agent>;
    listAgents(status?: string): Promise<Agent[]>;
    rememberForAgent(request: AgentMemoryRequest): Promise<string>;
    linkMemoryToAgent(agentId: string, memoryId: string, category: string, projectContext?: string): Promise<void>;
    recallAgentMemories(request: AgentRecallRequest): Promise<AgentMemory[]>;
    handleErrorLearning(request: ErrorLearningRequest): Promise<ErrorLearningResponse>;
    saveErrorSolution(request: ErrorSolutionRequest): Promise<void>;
    recordFailedAttempt(agentId: string, patternId: string, attemptedSolution: string): Promise<void>;
    createReflection(request: ReflectionRequest): Promise<void>;
    getAgentReflections(agentId: string, reflectionType?: string): Promise<Reflection[]>;
    private protoToAgent;
    private protoToAgentMemory;
    private protoToReflection;
    private protoToErrorResponse;
    private timestampToDate;
    private deriveErrorType;
}
//# sourceMappingURL=agent.d.ts.map