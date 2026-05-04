/**
 * Skill Schedule Service gRPC Client
 *
 * Connects to the Rust backend SkillScheduleService for managing
 * scheduled skill runs and execution logs.
 */

import { buildCredentials } from '../../client/tls-config.js';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AuthManager } from '../../auth/AuthManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const SkillScheduleService = protoDescriptor.jaumemory.v1.SkillScheduleService;

export class SchedulesServiceClient {
  private client: any;
  private authManager: AuthManager;

  constructor(address: string, authManager: AuthManager, useTls: boolean = true) {
    const credentials = buildCredentials(useTls);

    this.client = new SkillScheduleService(address, credentials);
    this.authManager = authManager;

    logger.info(`Connected to SkillSchedule Service at ${address} (TLS: ${useTls})`);
  }

  private async getMetadata(): Promise<grpc.Metadata> {
    const metadata = new grpc.Metadata();
    const authHeaders = await this.authManager.getAuthHeaders();
    Object.entries(authHeaders).forEach(([key, value]) => {
      metadata.add(key.toLowerCase(), value);
    });
    metadata.add('x-client-type', 'mcp-server');
    metadata.add('x-client-id', 'jaumemory-schedules-mcp');
    return metadata;
  }

  async scheduleSkill(request: {
    skill_id: string;
    cron_expression: string;
    timezone?: string;
    max_retries?: number;
    retry_delay_seconds?: number;
    notify_on_failure?: boolean;
    notify_on_success?: boolean;
  }): Promise<any> {
    const metadata = await this.getMetadata();
    return new Promise((resolve, reject) => {
      this.client.scheduleSkill(request, metadata, (error: any, response: any) => {
        if (error) { reject(error); } else { resolve(response); }
      });
    });
  }

  async listSchedules(request: {
    skill_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ runs: any[] }> {
    const metadata = await this.getMetadata();
    return new Promise((resolve, reject) => {
      this.client.listSchedules({
        skill_id: request.skill_id,
        status: request.status,
        limit: request.limit || 50,
        offset: request.offset || 0
      }, metadata, (error: any, response: any) => {
        if (error) { reject(error); } else { resolve({ runs: response.runs || [] }); }
      });
    });
  }

  async updateSchedule(request: {
    schedule_id: string;
    cron_expression?: string;
    enabled?: boolean;
    max_retries?: number;
    retry_delay_seconds?: number;
    notify_on_failure?: boolean;
    notify_on_success?: boolean;
  }): Promise<any> {
    const metadata = await this.getMetadata();
    return new Promise((resolve, reject) => {
      this.client.updateSchedule(request, metadata, (error: any, response: any) => {
        if (error) { reject(error); } else { resolve(response); }
      });
    });
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    const metadata = await this.getMetadata();
    return new Promise((resolve, reject) => {
      this.client.deleteSchedule({ schedule_id: scheduleId }, metadata, (error: any) => {
        if (error) { reject(error); } else { resolve(); }
      });
    });
  }

  async retriggerSchedule(scheduleId: string): Promise<any> {
    const metadata = await this.getMetadata();
    return new Promise((resolve, reject) => {
      this.client.retriggerSchedule({ schedule_id: scheduleId }, metadata, (error: any, response: any) => {
        if (error) { reject(error); } else { resolve(response); }
      });
    });
  }

  async listExecutionLogs(request: {
    skill_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: any[] }> {
    const metadata = await this.getMetadata();
    return new Promise((resolve, reject) => {
      this.client.listExecutionLogs({
        skill_id: request.skill_id,
        status: request.status,
        limit: request.limit || 50,
        offset: request.offset || 0
      }, metadata, (error: any, response: any) => {
        if (error) { reject(error); } else { resolve({ logs: response.logs || [] }); }
      });
    });
  }

  async getExecutionLog(logId: string): Promise<any> {
    const metadata = await this.getMetadata();
    return new Promise((resolve, reject) => {
      this.client.getExecutionLog({ log_id: logId }, metadata, (error: any, response: any) => {
        if (error) { reject(error); } else { resolve(response); }
      });
    });
  }
}
