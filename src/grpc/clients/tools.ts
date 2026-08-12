/**
 * Tool Service gRPC Client
 *
 * Connects to the Rust backend tool registry service for managing vendor-agnostic tools
 */

import { buildCredentials } from '../../client/tls-config.js';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AuthManager } from '../../auth/AuthManager.js';
import { standardDeadline } from '../deadline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load proto file
const PROTO_PATH = path.join(__dirname, '../../../proto/tools.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [path.join(__dirname, '../../../proto')]
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const ToolService = protoDescriptor.jaumemory.v1.ToolService;

export class ToolsServiceClient {
  private client: any;
  private authManager: AuthManager;

  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    const credentials = buildCredentials(useTls);

    this.client = new ToolService(address, credentials);
    this.authManager = authManager;

    logger.info(`Connected to Tool Service at ${address} (TLS: ${useTls})`);
  }

  private async getMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const authHeaders = await this.authManager.getAuthHeaders();

    Object.entries(authHeaders).forEach(([key, value]) => {
      metadata.add(key.toLowerCase(), value);
    });

    metadata.add('x-client-type', 'mcp-server');
    metadata.add('x-client-id', 'jaumemory-tools-mcp');

    return metadata;
  }

  async createTool(request: {
    name: string;
    description?: string;
    tool_type: string;
    category_id?: string;
    base_url?: string;
    endpoints_json?: string;
    credential_id?: string;
    hosting_provider?: string;
    hosting_metadata_json?: string;
    health_check_url?: string;
    rate_limit_json?: string;
    cost_per_call_json?: string;
    is_public?: boolean;
    input_schema_json?: string;
    output_schema_json?: string;
    tags?: string[];
    metadata_json?: string;
  }): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.createTool({
        name: request.name,
        description: request.description,
        tool_type: request.tool_type,
        category_id: request.category_id,
        base_url: request.base_url,
        endpoints_json: request.endpoints_json,
        credential_id: request.credential_id,
        hosting_provider: request.hosting_provider,
        hosting_metadata_json: request.hosting_metadata_json,
        health_check_url: request.health_check_url,
        rate_limit_json: request.rate_limit_json,
        cost_per_call_json: request.cost_per_call_json,
        is_public: request.is_public,
        input_schema_json: request.input_schema_json,
        output_schema_json: request.output_schema_json,
        tags: request.tags || [],
        metadata_json: request.metadata_json
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('CreateTool error:', error);
          reject(error);
        } else {
          resolve(this.protoToTool(response));
        }
      });
    });
  }

  async listTools(request: {
    limit?: number;
    offset?: number;
    tool_type?: string;
    category_id?: string;
    active_only?: boolean;
    include_public?: boolean;
    search?: string;
  } = {}): Promise<{ tools: any[]; total: number }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.listTools({
        limit: request.limit || 100,
        offset: request.offset || 0,
        tool_type: request.tool_type,
        category_id: request.category_id,
        active_only: request.active_only,
        include_public: request.include_public,
        search: request.search
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('ListTools error:', error);
          reject(error);
        } else {
          resolve({
            tools: (response.tools || []).map((t: any) => this.protoToTool(t)),
            total: response.total
          });
        }
      });
    });
  }

  async getTool(identifier: string): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.getTool({
        identifier
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('GetTool error:', error);
          reject(error);
        } else {
          resolve(this.protoToTool(response));
        }
      });
    });
  }

  async updateTool(request: {
    tool_id: string;
    name?: string;
    description?: string;
    tool_type?: string;
    category_id?: string;
    base_url?: string;
    endpoints_json?: string;
    hosting_provider?: string;
    hosting_metadata_json?: string;
    health_check_url?: string;
    rate_limit_json?: string;
    cost_per_call_json?: string;
    is_public?: boolean;
    is_active?: boolean;
    input_schema_json?: string;
    output_schema_json?: string;
    tags?: string[];
    metadata_json?: string;
  }): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.updateTool({
        tool_id: request.tool_id,
        name: request.name,
        description: request.description,
        tool_type: request.tool_type,
        category_id: request.category_id,
        base_url: request.base_url,
        endpoints_json: request.endpoints_json,
        hosting_provider: request.hosting_provider,
        hosting_metadata_json: request.hosting_metadata_json,
        health_check_url: request.health_check_url,
        rate_limit_json: request.rate_limit_json,
        cost_per_call_json: request.cost_per_call_json,
        is_public: request.is_public,
        is_active: request.is_active,
        input_schema_json: request.input_schema_json,
        output_schema_json: request.output_schema_json,
        tags: request.tags || [],
        metadata_json: request.metadata_json
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('UpdateTool error:', error);
          reject(error);
        } else {
          resolve(this.protoToTool(response));
        }
      });
    });
  }

  async deleteTool(toolId: string): Promise<void> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.deleteTool({
        tool_id: toolId
      }, metadata, standardDeadline(), (error: any) => {
        if (error) {
          logger.error('DeleteTool error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async callTool(request: {
    slug: string;
    endpoint_index?: number;
    method?: string;
    path_suffix?: string;
    request_body?: string;
    query_params?: Record<string, string>;
    extra_headers?: Record<string, string>;
  }): Promise<{
    http_status: number;
    response_body: string;
    response_headers: Record<string, string>;
    response_time_ms: number;
    success: boolean;
    error?: string;
    used_credential: boolean;
  }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.callTool({
        slug: request.slug,
        endpoint_index: request.endpoint_index,
        method: request.method,
        path_suffix: request.path_suffix,
        request_body: request.request_body,
        query_params: request.query_params || {},
        extra_headers: request.extra_headers || {}
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('CallTool error:', error);
          reject(error);
        } else {
          resolve({
            http_status: response.http_status,
            response_body: response.response_body,
            response_headers: response.response_headers || {},
            response_time_ms: Number(response.response_time_ms || 0),
            success: response.success,
            error: response.error,
            used_credential: response.used_credential || false
          });
        }
      });
    });
  }

  async renderTool(toolId: string): Promise<{ markdown: string; title: string }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.renderTool({
        tool_id: toolId
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('RenderTool error:', error);
          reject(error);
        } else {
          resolve({
            markdown: response.markdown,
            title: response.title
          });
        }
      });
    });
  }

  async checkHealth(toolId: string): Promise<{
    health_status: string;
    response_time_ms?: number;
    http_status?: number;
    checked_at: Date;
  }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.checkHealth({
        tool_id: toolId
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('CheckHealth error:', error);
          reject(error);
        } else {
          resolve({
            health_status: response.health_status,
            response_time_ms: response.response_time_ms,
            http_status: response.http_status,
            checked_at: this.timestampToDate(response.checked_at)
          });
        }
      });
    });
  }

  async linkCredential(toolId: string, credentialId: string): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.linkCredential({
        tool_id: toolId,
        credential_id: credentialId
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('LinkCredential error:', error);
          reject(error);
        } else {
          resolve(this.protoToTool(response));
        }
      });
    });
  }

  async unlinkCredential(toolId: string): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.unlinkCredential({
        tool_id: toolId
      }, metadata, standardDeadline(), (error: any, response: any) => {
        if (error) {
          logger.error('UnlinkCredential error:', error);
          reject(error);
        } else {
          resolve(this.protoToTool(response));
        }
      });
    });
  }

  private protoToTool(proto: any): any {
    return {
      id: proto.id,
      name: proto.name,
      slug: proto.slug,
      description: proto.description || '',
      version: proto.version,
      tool_type: proto.tool_type,
      category_id: proto.category_id || null,
      category_name: proto.category_name || '',
      base_url: proto.base_url || '',
      endpoints_json: proto.endpoints_json || '[]',
      credential_id: proto.credential_id || null,
      has_credential: proto.has_credential,
      hosting_provider: proto.hosting_provider || '',
      hosting_metadata_json: proto.hosting_metadata_json || '{}',
      health_check_url: proto.health_check_url || '',
      health_status: proto.health_status,
      health_checked_at: proto.health_checked_at ? this.timestampToDate(proto.health_checked_at) : null,
      avg_response_ms: proto.avg_response_ms,
      rate_limit_json: proto.rate_limit_json || '',
      cost_per_call_json: proto.cost_per_call_json || '',
      is_public: proto.is_public,
      is_active: proto.is_active,
      usage_count: Number(proto.usage_count || 0),
      last_used_at: proto.last_used_at ? this.timestampToDate(proto.last_used_at) : null,
      input_schema_json: proto.input_schema_json || '',
      output_schema_json: proto.output_schema_json || '',
      tags: proto.tags || [],
      metadata_json: proto.metadata_json || '{}',
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
