/**
 * Credential Service gRPC Client
 *
 * Connects to the Rust backend credential vault service for managing API credentials
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AuthManager } from '../../auth/AuthManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load proto file
const PROTO_PATH = path.join(__dirname, '../../../proto/credentials.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [path.join(__dirname, '../../../proto')]
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const CredentialService = protoDescriptor.jaumemory.v1.CredentialService;

export class CredentialsServiceClient {
  private client: any;
  private authManager: AuthManager;

  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    const credentials = useTls
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();

    this.client = new CredentialService(address, credentials);
    this.authManager = authManager;

    logger.info(`Connected to Credential Service at ${address} (TLS: ${useTls})`);
  }

  private async getMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const authHeaders = await this.authManager.getAuthHeaders();

    // Add auth headers
    Object.entries(authHeaders).forEach(([key, value]) => {
      metadata.add(key.toLowerCase(), value);
    });

    // Add client identification
    metadata.add('x-client-type', 'mcp-server');
    metadata.add('x-client-id', 'jaumemory-credentials-mcp');

    return metadata;
  }

  async storeCredential(request: {
    name: string;
    description?: string;
    provider?: string;
    credential_type: string;
    value: string;
    secondary_value?: string;
    auth_header?: string;
    auth_prefix?: string;
    injection_method?: string;
    injection_key?: string;
    rotation_reminder_days?: number;
    scopes?: string[];
    notes?: string;
  }): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.storeCredential({
        name: request.name,
        description: request.description,
        provider: request.provider,
        credential_type: request.credential_type,
        value: request.value,
        secondary_value: request.secondary_value,
        auth_header: request.auth_header,
        auth_prefix: request.auth_prefix,
        injection_method: request.injection_method,
        injection_key: request.injection_key,
        rotation_reminder_days: request.rotation_reminder_days,
        scopes: request.scopes || [],
        notes: request.notes
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('StoreCredential error:', error);
          reject(error);
        } else {
          resolve(this.protoToCredential(response));
        }
      });
    });
  }

  async listCredentials(request: {
    limit?: number;
    offset?: number;
    provider?: string;
    credential_type?: string;
    active_only?: boolean;
  } = {}): Promise<{ credentials: any[]; total: number }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.listCredentials({
        limit: request.limit || 100,
        offset: request.offset || 0,
        provider: request.provider,
        credential_type: request.credential_type,
        active_only: request.active_only
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('ListCredentials error:', error);
          reject(error);
        } else {
          resolve({
            credentials: (response.credentials || []).map((c: any) => this.protoToCredential(c)),
            total: response.total
          });
        }
      });
    });
  }

  async getCredential(credentialId: string): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.getCredential({
        credential_id: credentialId
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetCredential error:', error);
          reject(error);
        } else {
          resolve(this.protoToCredential(response));
        }
      });
    });
  }

  async updateCredential(request: {
    credential_id: string;
    name?: string;
    description?: string;
    provider?: string;
    auth_header?: string;
    auth_prefix?: string;
    injection_method?: string;
    injection_key?: string;
    is_active?: boolean;
    expires_at?: any;
    rotation_reminder_days?: number;
    scopes?: string[];
    notes?: string;
  }): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.updateCredential({
        credential_id: request.credential_id,
        name: request.name,
        description: request.description,
        provider: request.provider,
        auth_header: request.auth_header,
        auth_prefix: request.auth_prefix,
        injection_method: request.injection_method,
        injection_key: request.injection_key,
        is_active: request.is_active,
        expires_at: request.expires_at,
        rotation_reminder_days: request.rotation_reminder_days,
        scopes: request.scopes || [],
        notes: request.notes
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('UpdateCredential error:', error);
          reject(error);
        } else {
          resolve(this.protoToCredential(response));
        }
      });
    });
  }

  async deleteCredential(credentialId: string): Promise<void> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.deleteCredential({
        credential_id: credentialId
      }, metadata, (error: any) => {
        if (error) {
          logger.error('DeleteCredential error:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async rotateCredential(request: {
    credential_id: string;
    new_value: string;
    new_secondary_value?: string;
  }): Promise<any> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.rotateCredential({
        credential_id: request.credential_id,
        new_value: request.new_value,
        new_secondary_value: request.new_secondary_value
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('RotateCredential error:', error);
          reject(error);
        } else {
          resolve(this.protoToCredential(response));
        }
      });
    });
  }

  async verifyCredential(credentialId: string): Promise<{
    is_valid: boolean;
    status_message?: string;
    http_status?: number;
    checked_at: Date;
  }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.verifyCredential({
        credential_id: credentialId
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('VerifyCredential error:', error);
          reject(error);
        } else {
          resolve({
            is_valid: response.is_valid,
            status_message: response.status_message,
            http_status: response.http_status,
            checked_at: this.timestampToDate(response.checked_at)
          });
        }
      });
    });
  }

  async getAccessLog(request: {
    credential_id: string;
    limit?: number;
    offset?: number;
    action?: string;
  }): Promise<{ entries: any[]; total: number }> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.getAccessLog({
        credential_id: request.credential_id,
        limit: request.limit || 50,
        offset: request.offset || 0,
        action: request.action
      }, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetAccessLog error:', error);
          reject(error);
        } else {
          resolve({
            entries: (response.entries || []).map((e: any) => ({
              id: e.id,
              credential_id: e.credential_id,
              action: e.action,
              tool_id: e.tool_id,
              ip_address: e.ip_address,
              user_agent: e.user_agent,
              metadata: e.metadata || {},
              created_at: this.timestampToDate(e.created_at)
            })),
            total: response.total
          });
        }
      });
    });
  }

  async getProviderPresets(): Promise<any[]> {
    const metadata = await this.getMetadata();

    return new Promise((resolve, reject) => {
      this.client.getProviderPresets({}, metadata, (error: any, response: any) => {
        if (error) {
          logger.error('GetProviderPresets error:', error);
          reject(error);
        } else {
          resolve((response.presets || []).map((p: any) => ({
            provider: p.provider,
            display_name: p.display_name,
            default_auth_header: p.default_auth_header,
            default_auth_prefix: p.default_auth_prefix,
            default_credential_type: p.default_credential_type,
            base_url: p.base_url,
            docs_url: p.docs_url
          })));
        }
      });
    });
  }

  private protoToCredential(proto: any): any {
    return {
      id: proto.id,
      name: proto.name,
      slug: proto.slug,
      description: proto.description || '',
      provider: proto.provider || '',
      credential_type: proto.credential_type,
      masked_value: proto.masked_value,
      auth_header: proto.auth_header,
      auth_prefix: proto.auth_prefix,
      injection_method: proto.injection_method,
      injection_key: proto.injection_key,
      is_active: proto.is_active,
      expires_at: proto.expires_at ? this.timestampToDate(proto.expires_at) : null,
      last_used_at: proto.last_used_at ? this.timestampToDate(proto.last_used_at) : null,
      last_rotated_at: proto.last_rotated_at ? this.timestampToDate(proto.last_rotated_at) : null,
      rotation_reminder_days: proto.rotation_reminder_days,
      scopes: proto.scopes || [],
      notes: proto.notes || '',
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
