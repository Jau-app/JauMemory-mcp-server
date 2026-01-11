/**
 * Agent REST API Client
 */
import { AuthManager } from '../../auth/AuthManager.js';
export interface Agent {
    id: string;
    name: string;
    personalityTraits: string[];
    specializations: string[];
    learningRate: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, any>;
}
export interface CreateAgentRequest {
    userId: string;
    id?: string;
    name: string;
    personalityTraits?: string[];
    specializations?: string[];
    initialLearningRate?: number;
    updatePrompts?: string[];
}
export interface AgentMemory {
    agentId: string;
    memoryId: string;
    category: string;
    projectContext?: string;
    linkedAt: Date;
}
export interface ErrorReport {
    errorSignature: string;
    errorMessage: string;
    contextSnapshot?: string;
    attemptedSolution?: string;
    projectContext?: string;
}
export interface ErrorPattern {
    patternId: string;
    signature: string;
    occurrences: number;
    firstSeen: Date;
    lastSeen: Date;
    solved: boolean;
    solution?: string;
}
export interface Reflection {
    id: string;
    agentId: string;
    reflectionType: 'learning' | 'mistake' | 'success' | 'collaboration';
    content: string;
    lessonsLearned: string[];
    relatedAgents?: string[];
    createdAt: Date;
}
export interface Collaboration {
    id: string;
    agentId: string;
    collaboratorId: string;
    collaborationType: string;
    memoryId?: string;
    startedAt: Date;
    completedAt?: Date;
    outcome?: 'success' | 'partial' | 'failed';
}
export declare class AgentServiceClient {
    private client;
    private authManager;
    constructor(baseUrl: string, authManager: AuthManager);
    private getHeaders;
    createAgent(request: CreateAgentRequest): Promise<Agent>;
    listAgents(status?: string): Promise<Agent[]>;
    getAgent(agentId: string): Promise<Agent>;
    updateAgentName(agentId: string, newName: string): Promise<Agent>;
    linkMemoryToAgent(agentId: string, memoryId: string, category: string, projectContext?: string): Promise<AgentMemory>;
    recallAgentMemories(options: {
        agentId: string;
        query?: string;
        category?: string;
        projectContext?: string;
        limit?: number;
    }): Promise<any[]>;
    reportError(agentId: string, report: ErrorReport): Promise<ErrorPattern>;
    solveError(agentId: string, patternId: string, solution: string, verificationSteps?: string[]): Promise<void>;
    createReflection(agentId: string, reflection: Omit<Reflection, 'id' | 'agentId' | 'createdAt'>): Promise<Reflection>;
    getReflections(agentId: string, reflectionType?: string): Promise<Reflection[]>;
    startCollaboration(agentId: string, collaboratorId: string, collaborationType: string, memoryId?: string): Promise<Collaboration>;
    completeCollaboration(agentId: string, collaborationId: string, outcome: 'success' | 'partial' | 'failed'): Promise<void>;
    listCollaborations(agentId: string): Promise<Collaboration[]>;
    private transformAgent;
    private transformAgentMemory;
    private transformErrorPattern;
    private transformReflection;
    private transformCollaboration;
}
//# sourceMappingURL=agent.d.ts.map