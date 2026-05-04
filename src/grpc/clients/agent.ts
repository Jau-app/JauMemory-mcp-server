/**
 * Agent Service gRPC Client
 * 
 * Connects to the Rust backend agent service for multi-agent memory management
 */

import { buildCredentials } from '../../client/tls-config.js';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AuthManager } from '../../auth/AuthManager.js';

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

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const AgentService = protoDescriptor.jaumemory.v1.AgentService;

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
  id?: string;  // Optional agent ID
  initialLearningRate?: number;  // Optional initial learning rate (0.0-1.0)
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
  memory?: any; // Will be populated with full memory object
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

export class AgentServiceClient {
  private client: any;
  private authManager: AuthManager;

  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    const credentials = buildCredentials(useTls);
    
    this.client = new AgentService(address, credentials);
    this.authManager = authManager;
    
    logger.info(`Connected to Agent Service at ${address} (TLS: ${useTls})`);
  }

  private async getMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const authHeaders = await this.authManager.getAuthHeaders();
    
    logger.debug('Creating gRPC metadata', { keys: Object.keys(authHeaders) });

    // Add ALL auth headers (including x-sync-id)
    Object.entries(authHeaders).forEach(([key, value]) => {
      metadata.add(key.toLowerCase(), value);
    });

    // Add client identification
    metadata.add('x-client-type', 'mcp-server');
    metadata.add('x-client-id', 'jaumemory-agent-mcp');

    logger.debug('Final gRPC metadata keys:', Object.keys(metadata.getMap()));

    return metadata;
  }

  async createAgent(request: CreateAgentRequest): Promise<Agent> {
    const metadata = await this.getMetadata();

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
        id: request.id,  // Pass the ID if provided
        initial_learning_rate: request.initialLearningRate  // Pass the learning rate if provided
      }, metadata, options, (error: any, response: any) => {
        if (error) {
          logger.error('CreateAgent error:', error);
          // Check if it's a cancellation error but the operation might have succeeded
          if (error.code === grpc.status.CANCELLED || error.code === 1) {
            logger.warn('CreateAgent request cancelled, but agent may have been created successfully. Error:', error.message);
            // You might want to check if the agent exists by trying to get it
          }
          reject(error);
        } else {
          logger.info('CreateAgent success:', { agentId: response.id, name: response.name });
          resolve(this.protoToAgent(response));
        }
      });
    });
  }

  async getAgent(agentId: string): Promise<Agent> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      
      this.client.getAgent({
        agent_id: agentId
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetAgent error:', error);
          reject(error);
        } else {
          resolve(this.protoToAgent(response));
        }
      });
    });
  }

  async updateAgent(agentId: string, status?: string, updatePrompts?: string[]): Promise<Agent> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      const request: any = { agent_id: agentId };
      if (status) request.status = status;
      if (updatePrompts) request.update_prompts = updatePrompts;

      this.client.updateAgent(request, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('UpdateAgent error:', error);
          reject(error);
        } else {
          resolve(this.protoToAgent(response));
        }
      });
    });
  }

  async updateAgentName(agentId: string, newName: string): Promise<Agent> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      
      this.client.updateAgentName({
        agent_id: agentId,
        new_name: newName
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('UpdateAgentName error:', error);
          reject(error);
        } else {
          resolve(this.protoToAgent(response));
        }
      });
    });
  }

  async listAgents(status?: string): Promise<Agent[]> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      const request: any = {};
      if (status) request.status = status;

      this.client.listAgents(request, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('ListAgents error:', error);
          reject(error);
        } else {
          resolve(response.agents.map((a: any) => this.protoToAgent(a)));
        }
      });
    });
  }

  async rememberForAgent(request: AgentMemoryRequest): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      
      this.client.rememberForAgent({
        agent_id: request.agentId,
        content: request.content,
        category: request.category,
        project_context: request.projectContext,
        metadata: request.metadata || {}
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('RememberForAgent error:', error);
          reject(error);
        } else {
          resolve(response.memory_id);
        }
      });
    });
  }

  async linkMemoryToAgent(agentId: string, memoryId: string, category: string, projectContext?: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();

      this.client.linkMemoryToAgent({
        agent_id: agentId,
        memory_id: memoryId,
        category: category,
        project_context: projectContext
      }, metadata, (error: any) => {
        if (error) {
          logger.error('LinkMemoryToAgent error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async recallAgentMemories(request: AgentRecallRequest): Promise<AgentMemory[]> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      
      this.client.recallAgentMemories({
        agent_id: request.agentId,
        query: request.query,
        category: request.category,
        project_context: request.projectContext,
        limit: request.limit || 20
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('RecallAgentMemories error:', error);
          reject(error);
        } else {
          resolve(response.memories.map((m: any) => this.protoToAgentMemory(m)));
        }
      });
    });
  }

  async handleErrorLearning(request: ErrorLearningRequest): Promise<ErrorLearningResponse> {
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
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('HandleErrorLearning error:', error);
          reject(error);
        } else {
          resolve(this.protoToErrorResponse(response));
        }
      });
    });
  }

  async saveErrorSolution(request: ErrorSolutionRequest): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      
      this.client.saveErrorSolution({
        agent_id: request.agentId,
        pattern_id: request.patternId,
        solution: request.solution,
        verification_steps: request.verificationSteps || []
      }, metadata, (error: any) => {
        if (error) {
          logger.error('SaveErrorSolution error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async recordFailedAttempt(agentId: string, patternId: string, attemptedSolution: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      
      this.client.recordFailedAttempt({
        agent_id: agentId,
        pattern_id: patternId,
        attempted_solution: attemptedSolution
      }, metadata, (error: any) => {
        if (error) {
          logger.error('RecordFailedAttempt error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async createReflection(request: ReflectionRequest): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      
      this.client.createReflection({
        agent_id: request.agentId,
        reflection_type: request.reflectionType,
        content: request.content,
        lessons_learned: request.lessonsLearned || [],
        related_agents: request.relatedAgents || []
      }, metadata, (error: any) => {
        if (error) {
          logger.error('CreateReflection error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async getAgentReflections(agentId: string, reflectionType?: string): Promise<Reflection[]> {
    return new Promise(async (resolve, reject) => {
      const metadata = await this.getMetadata();
      const request: any = { agent_id: agentId };
      if (reflectionType) request.reflection_type = reflectionType;

      this.client.getReflections(request, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetAgentReflections error:', error);
          reject(error);
        } else {
          resolve(response.reflections.map((r: any) => this.protoToReflection(r)));
        }
      });
    });
  }

  private protoToAgent(proto: any): Agent {
    return {
      id: proto.id,
      name: proto.name,
      personalityTraits: proto.personality_traits || [],
      specializations: proto.specializations || [],
      status: proto.status as any,
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

  private protoToAgentMemory(proto: any): AgentMemory {
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

  private protoToReflection(proto: any): Reflection {
    const collaborationNotes: Record<string, string> = {};
    if (proto.collaboration_notes) {
      for (const [key, value] of Object.entries(proto.collaboration_notes)) {
        collaborationNotes[key] = value as string;
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

  private protoToErrorResponse(proto: any): ErrorLearningResponse {
    const response: ErrorLearningResponse = {
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
      } else if (proto.response.solution_found) {
        response.type = 'solution_found';
        response.solution = proto.response.solution_found.solution;
        response.verificationSteps = proto.response.solution_found.verification_steps || [];
      } else if (proto.response.previous_attempts_failed) {
        response.type = 'previous_attempts_failed';
        response.previousAttempts = proto.attempt_count;
      } else if (proto.response.new_problem) {
        response.type = 'new_problem';
        response.similarPatternsCount = proto.response.new_problem.similar_patterns_count;
      }
    }
    
    return response;
  }

  private timestampToDate(timestamp: any): Date {
    if (!timestamp) return new Date();
    const seconds = Number(timestamp.seconds || 0);
    const nanos = Number(timestamp.nanos || 0);
    return new Date(seconds * 1000 + nanos / 1000000);
  }

  private deriveErrorType(errorSignature: string): string {
    if (errorSignature.includes('TypeError')) return 'type_error';
    if (errorSignature.includes('ReferenceError')) return 'reference_error';
    if (errorSignature.includes('SyntaxError')) return 'syntax_error';
    if (errorSignature.includes('RangeError')) return 'range_error';
    if (errorSignature.includes('Error')) return 'generic_error';
    return 'unknown_error';
  }
}