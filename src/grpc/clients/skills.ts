/**
 * Skill Service gRPC Client
 *
 * Connects to the Rust backend skill service for managing composed workflows
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
const PROTO_PATH = path.join(__dirname, '../../../proto/skills.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [path.join(__dirname, '../../../proto')]
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const SkillService = protoDescriptor.jaumemory.v1.SkillService;

export class SkillsServiceClient {
  private client: any;
  private authManager: AuthManager;

  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    const credentials = buildCredentials(useTls);

    this.client = new SkillService(address, credentials);
    this.authManager = authManager;

    logger.info(`Connected to Skill Service at ${address} (TLS: ${useTls})`);
  }

  private async getMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const authHeaders = await this.authManager.getAuthHeaders();

    Object.entries(authHeaders).forEach(([key, value]) => {
      metadata.add(key.toLowerCase(), value);
    });

    metadata.add('x-client-type', 'mcp-server');
    metadata.add('x-client-id', 'jaumemory-skills-mcp');

    return metadata;
  }

  async createSkill(request: {
    name: string;
    description?: string;
    skill_type: string;
    category_id?: string;
    trigger_phrases?: string[];
    workflow_steps_json?: string;
    input_schema_json?: string;
    output_schema_json?: string;
    is_public?: boolean;
    tags?: string[];
    metadata_json?: string;
    pipeline_json?: string;
    tldr_json?: string;
    safety_limits_json?: string;
  }): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.createSkill({
        name: request.name,
        description: request.description,
        skill_type: request.skill_type,
        category_id: request.category_id,
        trigger_phrases: request.trigger_phrases || [],
        workflow_steps_json: request.workflow_steps_json,
        input_schema_json: request.input_schema_json,
        output_schema_json: request.output_schema_json,
        is_public: request.is_public,
        tags: request.tags || [],
        metadata_json: request.metadata_json,
        pipeline_json: request.pipeline_json,
        tldr_json: request.tldr_json,
        safety_limits_json: request.safety_limits_json
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('CreateSkill error:', error);
          reject(error);
        } else {
          resolve(this.protoToSkill(response));
        }
      });
    });
  }

  async listSkills(request: {
    limit?: number;
    offset?: number;
    skill_type?: string;
    category_id?: string;
    active_only?: boolean;
    include_public?: boolean;
    search?: string;
  } = {}): Promise<{ skills: any[]; total: number }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.listSkills({
        limit: request.limit || 100,
        offset: request.offset || 0,
        skill_type: request.skill_type,
        category_id: request.category_id,
        active_only: request.active_only,
        include_public: request.include_public,
        search: request.search
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('ListSkills error:', error);
          reject(error);
        } else {
          resolve({
            skills: (response.skills || []).map((s: any) => this.protoToSkill(s)),
            total: response.total
          });
        }
      });
    });
  }

  async getSkill(identifier: string): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.getSkill({
        identifier
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetSkill error:', error);
          reject(error);
        } else {
          resolve(this.protoToSkill(response));
        }
      });
    });
  }

  async updateSkill(request: {
    skill_id: string;
    name?: string;
    description?: string;
    skill_type?: string;
    category_id?: string;
    trigger_phrases?: string[];
    workflow_steps_json?: string;
    input_schema_json?: string;
    output_schema_json?: string;
    is_public?: boolean;
    is_active?: boolean;
    tags?: string[];
    metadata_json?: string;
    pipeline_json?: string;
    tldr_json?: string;
    safety_limits_json?: string;
  }): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.updateSkill({
        skill_id: request.skill_id,
        name: request.name,
        description: request.description,
        skill_type: request.skill_type,
        category_id: request.category_id,
        trigger_phrases: request.trigger_phrases || [],
        workflow_steps_json: request.workflow_steps_json,
        input_schema_json: request.input_schema_json,
        output_schema_json: request.output_schema_json,
        is_public: request.is_public,
        is_active: request.is_active,
        tags: request.tags || [],
        metadata_json: request.metadata_json,
        pipeline_json: request.pipeline_json,
        tldr_json: request.tldr_json,
        safety_limits_json: request.safety_limits_json
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('UpdateSkill error:', error);
          reject(error);
        } else {
          resolve(this.protoToSkill(response));
        }
      });
    });
  }

  async deleteSkill(skillId: string): Promise<void> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.deleteSkill({
        skill_id: skillId
      }, metadata, (error: any) => {
        if (error) {
          logger.error('DeleteSkill error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async executeSkill(request: {
    slug: string;
    input_json?: string;
    step_overrides?: Record<string, string>;
    resume_token?: string;
    llm_response?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    step_results: any[];
    output_json?: string;
    total_duration_ms: number;
    output_classification: string;
    paused: boolean;
    llm_prompt?: string;
    llm_context_json?: string;
    llm_options: string[];
    resume_token?: string;
  }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.executeSkill({
        slug: request.slug,
        input_json: request.input_json,
        step_overrides: request.step_overrides || {},
        resume_token: request.resume_token,
        llm_response: request.llm_response
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('ExecuteSkill error:', error);
          reject(error);
        } else {
          resolve({
            success: response.success,
            error: response.error,
            step_results: (response.step_results || []).map((sr: any) => ({
              step_id: sr.step_id || '',
              step_type: sr.step_type || '',
              step_order: sr.step_order,
              tool_slug: sr.tool_slug,
              success: sr.success,
              error: sr.error,
              http_status: sr.http_status,
              response_body: sr.response_body,
              duration_ms: Number(sr.duration_ms || 0),
              skipped: sr.skipped,
              output_classification: sr.output_classification
            })),
            output_json: response.output_json,
            total_duration_ms: Number(response.total_duration_ms || 0),
            output_classification: response.output_classification,
            paused: response.paused || false,
            llm_prompt: response.llm_prompt,
            llm_context_json: response.llm_context_json,
            llm_options: response.llm_options || [],
            resume_token: response.resume_token
          });
        }
      });
    });
  }

  async renderSkill(skillId: string): Promise<{
    markdown: string;
    title: string;
    tool_count: number;
  }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.renderSkill({
        skill_id: skillId
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('RenderSkill error:', error);
          reject(error);
        } else {
          resolve({
            markdown: response.markdown,
            title: response.title,
            tool_count: response.tool_count
          });
        }
      });
    });
  }

  async addStep(request: {
    skill_id: string;
    tool_id: string;
    step_order: number;
    input_mapping_json?: string;
    output_mapping_json?: string;
    is_optional?: boolean;
    condition_json?: string;
  }): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.addStep({
        skill_id: request.skill_id,
        tool_id: request.tool_id,
        step_order: request.step_order,
        input_mapping_json: request.input_mapping_json,
        output_mapping_json: request.output_mapping_json,
        is_optional: request.is_optional,
        condition_json: request.condition_json
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('AddStep error:', error);
          reject(error);
        } else {
          resolve(this.protoToSkill(response));
        }
      });
    });
  }

  async removeStep(skillId: string, stepId: string): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.removeStep({
        skill_id: skillId,
        step_id: stepId
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('RemoveStep error:', error);
          reject(error);
        } else {
          resolve(this.protoToSkill(response));
        }
      });
    });
  }

  async reorderSteps(skillId: string, stepIds: string[]): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.reorderSteps({
        skill_id: skillId,
        step_ids: stepIds
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('ReorderSteps error:', error);
          reject(error);
        } else {
          resolve(this.protoToSkill(response));
        }
      });
    });
  }

  async searchToolkit(request: {
    query: string;
    limit?: number;
    category_id?: string;
    tools_only?: boolean;
    skills_only?: boolean;
  }): Promise<{ results: any[]; total: number }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.searchToolkit({
        query: request.query,
        limit: request.limit || 20,
        category_id: request.category_id,
        tools_only: request.tools_only,
        skills_only: request.skills_only
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('SearchToolkit error:', error);
          reject(error);
        } else {
          resolve({
            results: (response.results || []).map((r: any) => ({
              id: r.id,
              name: r.name,
              slug: r.slug,
              description: r.description || '',
              result_type: r.result_type,
              category_name: r.category_name || '',
              tags: r.tags || [],
              is_public: r.is_public,
              usage_count: Number(r.usage_count || 0)
            })),
            total: response.total
          });
        }
      });
    });
  }

  private protoToSkill(proto: any): any {
    return {
      id: proto.id,
      name: proto.name,
      slug: proto.slug,
      description: proto.description || '',
      version: proto.version,
      skill_type: proto.skill_type,
      category_id: proto.category_id || null,
      category_name: proto.category_name || '',
      trigger_phrases: proto.trigger_phrases || [],
      workflow_steps_json: proto.workflow_steps_json || '[]',
      input_schema_json: proto.input_schema_json || '',
      output_schema_json: proto.output_schema_json || '',
      is_public: proto.is_public,
      is_active: proto.is_active,
      usage_count: Number(proto.usage_count || 0),
      last_used_at: proto.last_used_at ? this.timestampToDate(proto.last_used_at) : null,
      tags: proto.tags || [],
      metadata_json: proto.metadata_json || '{}',
      tool_steps: (proto.tool_steps || []).map((ts: any) => ({
        id: ts.id,
        tool_id: ts.tool_id,
        tool_name: ts.tool_name,
        tool_slug: ts.tool_slug,
        step_order: ts.step_order,
        input_mapping_json: ts.input_mapping_json || '{}',
        output_mapping_json: ts.output_mapping_json || '{}',
        is_optional: ts.is_optional,
        condition_json: ts.condition_json || ''
      })),
      pipeline_json: proto.pipeline_json || '[]',
      tldr_json: proto.tldr_json || '',
      safety_limits_json: proto.safety_limits_json || '',
      schedule_json: proto.schedule_json || '',
      credential_rotation_config_json: proto.credential_rotation_config_json || '',
      created_at: this.timestampToDate(proto.created_at),
      updated_at: this.timestampToDate(proto.updated_at)
    };
  }

  private timestampToDate(timestamp: any): Date {
    if (!timestamp) return new Date();
    const seconds = Number(timestamp.seconds || 0);
    const nanos = Number(timestamp.nanos || 0);
    return new Date(seconds * 1000 + nanos / 1000000);
  }
}
