/**
 * Agent Service gRPC Client
 *
 * Connects to the Rust backend agent service for multi-agent memory management
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load proto file
const PROTO_PATH = path.join(__dirname, '../../../proto/agent.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [path.join(__dirname, '../../../proto')]
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const AgentService = protoDescriptor.jaumemory.v1.AgentService;
export class AgentServiceClient {
    client;
    authManager;
    constructor(address, authManager, useTls = true) {
        const credentials = useTls
            ? grpc.credentials.createSsl()
            : grpc.credentials.createInsecure();
        this.client = new AgentService(address, credentials);
        this.authManager = authManager;
        logger.info(`Connected to Agent Service at ${address} (TLS: ${useTls})`);
    }
    async getMetadata() {
        const metadata = new grpc.Metadata();
        const authHeaders = await this.authManager.getAuthHeaders();
        logger.debug('Creating gRPC metadata with auth headers:', authHeaders);
        // Log the actual header values
        logger.info('AUTH HEADERS DEBUG:', {
            hasAuthorization: !!authHeaders.authorization,
            hasXUserId: !!authHeaders['x-user-id'],
            hasXSyncId: !!authHeaders['x-sync-id'],
            xUserIdValue: authHeaders['x-user-id'],
            authHeaderKeys: Object.keys(authHeaders)
        });
        // Add ALL auth headers (including x-sync-id)
        Object.entries(authHeaders).forEach(([key, value]) => {
            metadata.add(key.toLowerCase(), value);
        });
        // Add client identification
        metadata.add('x-client-type', 'mcp-server');
        metadata.add('x-client-id', 'jaumemory-agent-mcp');
        logger.debug('Final gRPC metadata keys:', metadata.getMap());
        // Verify x-user-id is actually in metadata
        const xUserIdInMetadata = metadata.get('x-user-id');
        logger.info('METADATA x-user-id CHECK:', {
            hasXUserId: xUserIdInMetadata.length > 0,
            xUserIdValue: xUserIdInMetadata.length > 0 ? xUserIdInMetadata[0] : 'NOT FOUND'
        });
        return metadata;
    }
    async createAgent(request) {
        logger.info('=== CALLING createAgent ===');
        const metadata = await this.getMetadata();
        // Debug logging
        logger.debug('CreateAgent metadata details:', {
            authorization: metadata.get('authorization'),
            'x-user-id': metadata.get('x-user-id'),
            'x-sync-id': metadata.get('x-sync-id')
        });
        // Add a reasonable deadline (30 seconds from now)
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 30);
        return new Promise((resolve, reject) => {
            // Create options with deadline
            const options = {
                deadline: deadline
            };
            this.client.createAgent({
                name: request.name,
                personality_traits: request.personalityTraits || [],
                specializations: request.specializations || [],
                update_prompts: request.updatePrompts || [],
                created_by: request.createdBy,
                id: request.id, // Pass the ID if provided
                initial_learning_rate: request.initialLearningRate // Pass the learning rate if provided
            }, metadata, options, (error, response) => {
                if (error) {
                    logger.error('CreateAgent error:', error);
                    // Check if it's a cancellation error but the operation might have succeeded
                    if (error.code === grpc.status.CANCELLED || error.code === 1) {
                        logger.warn('CreateAgent request cancelled, but agent may have been created successfully. Error:', error.message);
                        // You might want to check if the agent exists by trying to get it
                    }
                    reject(error);
                }
                else {
                    logger.info('CreateAgent success:', { agentId: response.id, name: response.name });
                    resolve(this.protoToAgent(response));
                }
            });
        });
    }
    async getAgent(agentId) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            this.client.getAgent({
                agent_id: agentId
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('GetAgent error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToAgent(response));
                }
            });
        });
    }
    async updateAgent(agentId, status, updatePrompts) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            const request = { agent_id: agentId };
            if (status)
                request.status = status;
            if (updatePrompts)
                request.update_prompts = updatePrompts;
            this.client.updateAgent(request, metadata, (error, response) => {
                if (error) {
                    logger.error('UpdateAgent error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToAgent(response));
                }
            });
        });
    }
    async updateAgentName(agentId, newName) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            this.client.updateAgentName({
                agent_id: agentId,
                new_name: newName
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('UpdateAgentName error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToAgent(response));
                }
            });
        });
    }
    async listAgents(status) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            const request = {};
            if (status)
                request.status = status;
            this.client.listAgents(request, metadata, (error, response) => {
                if (error) {
                    logger.error('ListAgents error:', error);
                    reject(error);
                }
                else {
                    resolve(response.agents.map((a) => this.protoToAgent(a)));
                }
            });
        });
    }
    async rememberForAgent(request) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            this.client.rememberForAgent({
                agent_id: request.agentId,
                content: request.content,
                category: request.category,
                project_context: request.projectContext,
                metadata: request.metadata || {}
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('RememberForAgent error:', error);
                    reject(error);
                }
                else {
                    resolve(response.memory_id);
                }
            });
        });
    }
    async linkMemoryToAgent(agentId, memoryId, category, projectContext) {
        logger.info('=== CALLING linkMemoryToAgent ===');
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            // Debug: Log the metadata being sent
            logger.debug('LinkMemoryToAgent metadata:', {
                metadataMap: metadata.getMap(),
                agentId,
                memoryId,
                category,
                projectContext
            });
            // More detailed logging
            logger.debug('LinkMemoryToAgent detailed headers:', {
                authorization: metadata.get('authorization'),
                'x-user-id': metadata.get('x-user-id'),
                'x-sync-id': metadata.get('x-sync-id'),
                'x-user-id-array': metadata.get('x-user-id') // Check if it's an array
            });
            this.client.linkMemoryToAgent({
                agent_id: agentId,
                memory_id: memoryId,
                category: category,
                project_context: projectContext
            }, metadata, (error) => {
                if (error) {
                    logger.error('LinkMemoryToAgent error:', error);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async recallAgentMemories(request) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            this.client.recallAgentMemories({
                agent_id: request.agentId,
                query: request.query,
                category: request.category,
                project_context: request.projectContext,
                limit: request.limit || 20
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('RecallAgentMemories error:', error);
                    reject(error);
                }
                else {
                    resolve(response.memories.map((m) => this.protoToAgentMemory(m)));
                }
            });
        });
    }
    async handleErrorLearning(request) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            this.client.handleErrorLearning({
                agent_id: request.agentId,
                error_signature: request.errorSignature,
                error_type: this.deriveErrorType(request.errorSignature),
                error_message: request.errorMessage,
                context: request.contextSnapshot || '',
                context_snapshot: request.contextSnapshot,
                attempted_solution: request.attemptedSolution,
                project_context: request.projectContext
            }, metadata, (error, response) => {
                if (error) {
                    logger.error('HandleErrorLearning error:', error);
                    reject(error);
                }
                else {
                    resolve(this.protoToErrorResponse(response));
                }
            });
        });
    }
    async saveErrorSolution(request) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            this.client.saveErrorSolution({
                agent_id: request.agentId,
                pattern_id: request.patternId,
                solution: request.solution,
                verification_steps: request.verificationSteps || []
            }, metadata, (error) => {
                if (error) {
                    logger.error('SaveErrorSolution error:', error);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async recordFailedAttempt(agentId, patternId, attemptedSolution) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            this.client.recordFailedAttempt({
                agent_id: agentId,
                pattern_id: patternId,
                attempted_solution: attemptedSolution
            }, metadata, (error) => {
                if (error) {
                    logger.error('RecordFailedAttempt error:', error);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async createReflection(request) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            this.client.createReflection({
                agent_id: request.agentId,
                reflection_type: request.reflectionType,
                content: request.content,
                lessons_learned: request.lessonsLearned || [],
                related_agents: request.relatedAgents || []
            }, metadata, (error) => {
                if (error) {
                    logger.error('CreateReflection error:', error);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async getAgentReflections(agentId, reflectionType) {
        return new Promise(async (resolve, reject) => {
            const metadata = await this.getMetadata();
            const request = { agent_id: agentId };
            if (reflectionType)
                request.reflection_type = reflectionType;
            this.client.getReflections(request, metadata, (error, response) => {
                if (error) {
                    logger.error('GetAgentReflections error:', error);
                    reject(error);
                }
                else {
                    resolve(response.reflections.map((r) => this.protoToReflection(r)));
                }
            });
        });
    }
    protoToAgent(proto) {
        return {
            id: proto.id,
            name: proto.name,
            personalityTraits: proto.personality_traits || [],
            specializations: proto.specializations || [],
            status: proto.status,
            createdBy: proto.created_by,
            createdAt: this.timestampToDate(proto.created_at),
            updatePrompts: proto.update_prompts || [],
            successCount: proto.success_count,
            errorCount: proto.error_count,
            learningRate: proto.learning_rate,
            collaborationCount: proto.collaboration_count,
            lastErrorAt: proto.last_error_at ? this.timestampToDate(proto.last_error_at) : undefined,
            lastSuccessAt: proto.last_success_at ? this.timestampToDate(proto.last_success_at) : undefined
        };
    }
    protoToAgentMemory(proto) {
        // The proto returns flat AgentMemory objects from the Rust backend
        return {
            agentId: proto.agent_id || '', // Not included in current proto response
            memoryId: proto.id, // The proto returns 'id' not 'memory_id'
            memory: {
                id: proto.id,
                content: proto.content,
                context: proto.category, // Using category as context
                importance: proto.importance,
                tags: [], // Not included in agent memory response
                createdAt: this.timestampToDate(proto.created_at)
            },
            category: proto.category,
            projectContext: proto.project_context,
            createdAt: this.timestampToDate(proto.created_at)
        };
    }
    protoToReflection(proto) {
        const collaborationNotes = {};
        if (proto.collaboration_notes) {
            for (const [key, value] of Object.entries(proto.collaboration_notes)) {
                collaborationNotes[key] = value;
            }
        }
        return {
            id: proto.id,
            agentId: proto.agent_id,
            reflectionType: proto.reflection_type,
            content: proto.content,
            lessonsLearned: proto.lessons_learned || [],
            collaborationNotes: Object.keys(collaborationNotes).length > 0 ? collaborationNotes : undefined,
            createdAt: this.timestampToDate(proto.created_at)
        };
    }
    protoToErrorResponse(proto) {
        const response = {
            type: proto.response_type || 'new_problem',
            patternId: proto.pattern_id,
            previousAttempts: proto.attempt_count
        };
        // Handle the response fields properly
        if (proto.solution_found) {
            response.solution = proto.solution_found.solution;
            response.verificationSteps = proto.solution_found.verification_steps || [];
        }
        if (proto.previous_solution) {
            response.solution = proto.previous_solution.solution;
            response.verificationSteps = proto.previous_solution.verification_steps || [];
        }
        // Handle the oneof response types
        if (proto.response) {
            if (proto.response.first_occurrence) {
                response.type = 'first_occurrence';
                response.patternId = proto.pattern_id;
            }
            else if (proto.response.solution_found) {
                response.type = 'solution_found';
                response.solution = proto.response.solution_found.solution;
                response.verificationSteps = proto.response.solution_found.verification_steps || [];
            }
            else if (proto.response.previous_attempts_failed) {
                response.type = 'previous_attempts_failed';
                response.previousAttempts = proto.attempt_count;
            }
            else if (proto.response.new_problem) {
                response.type = 'new_problem';
                response.similarPatternsCount = proto.response.new_problem.similar_patterns_count;
            }
        }
        return response;
    }
    timestampToDate(timestamp) {
        if (!timestamp)
            return new Date();
        const seconds = Number(timestamp.seconds || 0);
        const nanos = Number(timestamp.nanos || 0);
        return new Date(seconds * 1000 + nanos / 1000000);
    }
    deriveErrorType(errorSignature) {
        if (errorSignature.includes('TypeError'))
            return 'type_error';
        if (errorSignature.includes('ReferenceError'))
            return 'reference_error';
        if (errorSignature.includes('SyntaxError'))
            return 'syntax_error';
        if (errorSignature.includes('RangeError'))
            return 'range_error';
        if (errorSignature.includes('Error'))
            return 'generic_error';
        return 'unknown_error';
    }
}
//# sourceMappingURL=agent.js.map