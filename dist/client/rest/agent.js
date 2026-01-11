/**
 * Agent REST API Client
 */
import axios from 'axios';
import { logger } from '../../utils/logger.js';
export class AgentServiceClient {
    client;
    authManager;
    constructor(baseUrl, authManager) {
        this.authManager = authManager;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        logger.debug(`Connected to Agent Service REST API at ${baseUrl}`);
    }
    async getHeaders() {
        const authHeaders = await this.authManager.getAuthHeaders();
        return {
            ...authHeaders,
            'Content-Type': 'application/json'
        };
    }
    async createAgent(request) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post('/agents', {
                id: request.id,
                name: request.name,
                personality_traits: request.personalityTraits || [],
                specializations: request.specializations || [],
                learning_rate: request.initialLearningRate || 0.5,
                update_prompts: request.updatePrompts || []
            }, { headers });
            return this.transformAgent(response.data.data || response.data);
        }
        catch (error) {
            logger.error('CreateAgent REST error:', error);
            throw error;
        }
    }
    async listAgents(status) {
        try {
            const headers = await this.getHeaders();
            const params = status ? `?status=${status}` : '';
            const response = await this.client.get(`/agents${params}`, { headers });
            const data = response.data.data || response.data;
            return (data.agents || data || []).map((agent) => this.transformAgent(agent));
        }
        catch (error) {
            logger.error('ListAgents REST error:', error);
            throw error;
        }
    }
    async getAgent(agentId) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.get(`/agents/${agentId}`, { headers });
            return this.transformAgent(response.data.data || response.data);
        }
        catch (error) {
            logger.error('GetAgent REST error:', error);
            throw error;
        }
    }
    async updateAgentName(agentId, newName) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.put(`/agents/${agentId}/name`, { name: newName }, { headers });
            return this.transformAgent(response.data.data || response.data);
        }
        catch (error) {
            logger.error('UpdateAgentName REST error:', error);
            throw error;
        }
    }
    async linkMemoryToAgent(agentId, memoryId, category, projectContext) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post(`/agents/${agentId}/memories`, {
                memory_id: memoryId,
                category,
                context: projectContext
            }, { headers });
            return this.transformAgentMemory(response.data.data || response.data);
        }
        catch (error) {
            logger.error('LinkMemoryToAgent REST error:', error);
            throw error;
        }
    }
    async recallAgentMemories(options) {
        const { agentId, query, category, projectContext, limit } = options;
        try {
            const headers = await this.getHeaders();
            const params = new URLSearchParams();
            if (query)
                params.append('query', query);
            if (category)
                params.append('category', category);
            if (projectContext)
                params.append('project', projectContext);
            if (limit)
                params.append('limit', String(limit));
            const response = await this.client.get(`/agents/${agentId}/memories?${params.toString()}`, { headers });
            const data = response.data.data || response.data;
            return data.memories || data || [];
        }
        catch (error) {
            logger.error('GetAgentMemories REST error:', error);
            throw error;
        }
    }
    async reportError(agentId, report) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post(`/agents/${agentId}/errors`, {
                error_signature: report.errorSignature,
                error_message: report.errorMessage,
                context_snapshot: report.contextSnapshot,
                attempted_solution: report.attemptedSolution,
                project_context: report.projectContext
            }, { headers });
            return this.transformErrorPattern(response.data.data || response.data);
        }
        catch (error) {
            logger.error('ReportError REST error:', error);
            throw error;
        }
    }
    async solveError(agentId, patternId, solution, verificationSteps) {
        try {
            const headers = await this.getHeaders();
            await this.client.post(`/agents/${agentId}/errors/${patternId}/solve`, {
                solution,
                verification_steps: verificationSteps || []
            }, { headers });
        }
        catch (error) {
            logger.error('SolveError REST error:', error);
            throw error;
        }
    }
    async createReflection(agentId, reflection) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post(`/agents/${agentId}/reflections`, {
                reflection_type: reflection.reflectionType,
                content: reflection.content,
                lessons_learned: reflection.lessonsLearned,
                related_agents: reflection.relatedAgents
            }, { headers });
            return this.transformReflection(response.data.data || response.data);
        }
        catch (error) {
            logger.error('CreateReflection REST error:', error);
            throw error;
        }
    }
    async getReflections(agentId, reflectionType) {
        try {
            const headers = await this.getHeaders();
            const params = reflectionType ? `?reflection_type=${reflectionType}` : '';
            const response = await this.client.get(`/agents/${agentId}/reflections${params}`, { headers });
            const data = response.data.data || response.data;
            return (data.reflections || data || []).map((r) => this.transformReflection(r));
        }
        catch (error) {
            logger.error('GetReflections REST error:', error);
            throw error;
        }
    }
    async startCollaboration(agentId, collaboratorId, collaborationType, memoryId) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.post(`/agents/${agentId}/collaborations`, {
                collaborator_id: collaboratorId,
                collaboration_type: collaborationType,
                memory_id: memoryId
            }, { headers });
            return this.transformCollaboration(response.data.data || response.data);
        }
        catch (error) {
            logger.error('StartCollaboration REST error:', error);
            throw error;
        }
    }
    async completeCollaboration(agentId, collaborationId, outcome) {
        try {
            const headers = await this.getHeaders();
            await this.client.put(`/agents/${agentId}/collaborations/${collaborationId}`, {
                outcome
            }, { headers });
        }
        catch (error) {
            logger.error('CompleteCollaboration REST error:', error);
            throw error;
        }
    }
    async listCollaborations(agentId) {
        try {
            const headers = await this.getHeaders();
            const response = await this.client.get(`/agents/${agentId}/collaborations`, { headers });
            const data = response.data.data || response.data;
            return (data.collaborations || data || []).map((c) => this.transformCollaboration(c));
        }
        catch (error) {
            logger.error('ListCollaborations REST error:', error);
            throw error;
        }
    }
    transformAgent(data) {
        return {
            id: data.id,
            name: data.name,
            personalityTraits: data.personality_traits || data.personalityTraits || [],
            specializations: data.specializations || [],
            learningRate: data.learning_rate || data.learningRate || 0.5,
            status: data.status || 'active',
            createdAt: new Date(data.created_at || data.createdAt),
            updatedAt: new Date(data.updated_at || data.updatedAt),
            metadata: data.metadata
        };
    }
    transformAgentMemory(data) {
        return {
            agentId: data.agent_id || data.agentId,
            memoryId: data.memory_id || data.memoryId,
            category: data.category,
            projectContext: data.project_context || data.projectContext,
            linkedAt: new Date(data.linked_at || data.linkedAt || new Date())
        };
    }
    transformErrorPattern(data) {
        return {
            patternId: data.pattern_id || data.patternId || data.id,
            signature: data.signature || data.error_signature,
            occurrences: data.occurrences || 1,
            firstSeen: new Date(data.first_seen || data.firstSeen || new Date()),
            lastSeen: new Date(data.last_seen || data.lastSeen || new Date()),
            solved: data.solved || false,
            solution: data.solution
        };
    }
    transformReflection(data) {
        return {
            id: data.id,
            agentId: data.agent_id || data.agentId,
            reflectionType: data.reflection_type || data.reflectionType,
            content: data.content,
            lessonsLearned: data.lessons_learned || data.lessonsLearned || [],
            relatedAgents: data.related_agents || data.relatedAgents,
            createdAt: new Date(data.created_at || data.createdAt)
        };
    }
    transformCollaboration(data) {
        return {
            id: data.id || data.collaboration_id,
            agentId: data.agent_id || data.agentId,
            collaboratorId: data.collaborator_id || data.collaboratorId,
            collaborationType: data.collaboration_type || data.collaborationType,
            memoryId: data.memory_id || data.memoryId,
            startedAt: new Date(data.started_at || data.startedAt),
            completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
            outcome: data.outcome
        };
    }
}
//# sourceMappingURL=agent.js.map