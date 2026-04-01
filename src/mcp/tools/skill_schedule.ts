/**
 * Skill Schedule MCP Tools
 *
 * Tools for scheduling skill executions with cron expressions,
 * managing schedules, listing execution logs, and retriggering.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';

export function skillScheduleTool(clients: BackendClients): Tool {
  return {
    name: 'skill_schedule',
    description: 'Schedule a skill for recurring cron-based execution. Min interval: 60s. Max 20 active schedules per user.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: 'UUID of the skill to schedule (must be owned by you)'
        },
        cron_expression: {
          type: 'string',
          description: 'Cron expression (e.g. "0 */5 * * * *" for every 5 minutes). Min interval 60s.'
        },
        timezone: {
          type: 'string',
          description: 'Timezone for schedule (default: UTC)'
        },
        max_retries: {
          type: 'number',
          description: 'Max retry attempts on failure (0-10, default: 3)'
        },
        retry_delay_seconds: {
          type: 'number',
          description: 'Seconds between retries (10-3600, default: 60)'
        },
        notify_on_failure: {
          type: 'boolean',
          description: 'Notify on execution failure (default: true)'
        },
        notify_on_success: {
          type: 'boolean',
          description: 'Notify on execution success (default: false)'
        }
      },
      required: ['skill_id', 'cron_expression']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) throw new Error('Authentication required.');

        const result = await clients.schedules.scheduleSkill({
          skill_id: args.skill_id,
          cron_expression: args.cron_expression,
          timezone: args.timezone,
          max_retries: args.max_retries,
          retry_delay_seconds: args.retry_delay_seconds,
          notify_on_failure: args.notify_on_failure,
          notify_on_success: args.notify_on_success
        });

        return [{
          type: 'text',
          text: `Schedule created:\n  ID: ${result.id}\n  Cron: ${result.cron_expression}\n  Timezone: ${result.timezone}\n  Next run: ${result.next_run_at || 'pending'}\n  Enabled: ${result.enabled}`
        }];
      } catch (error) {
        logger.error('skill_schedule failed:', error);
        throw error;
      }
    }
  };
}

export function skillScheduleListTool(clients: BackendClients): Tool {
  return {
    name: 'skill_schedule_list',
    description: 'List scheduled skill runs with optional filtering by skill or status.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Filter by skill UUID' },
        status: { type: 'string', description: 'Filter by status (pending, running, failed, completed)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
        offset: { type: 'number', description: 'Offset for pagination (default: 0)' }
      }
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) throw new Error('Authentication required.');

        const { runs } = await clients.schedules.listSchedules({
          skill_id: args.skill_id,
          status: args.status,
          limit: args.limit || 20,
          offset: args.offset || 0
        });

        if (runs.length === 0) {
          return [{ type: 'text', text: 'No scheduled runs found.' }];
        }

        const lines = runs.map((r: any) =>
          `[${r.enabled ? 'ON' : 'OFF'}] ${r.id}\n  Skill: ${r.skill_id} | Cron: ${r.cron_expression}\n  Status: ${r.status} | Runs: ${r.run_count}\n  Next: ${r.next_run_at || 'none'} | Last: ${r.last_run_at || 'never'}${r.last_error ? `\n  Error: ${r.last_error}` : ''}`
        ).join('\n\n');

        return [{ type: 'text', text: `Scheduled Runs (${runs.length}):\n\n${lines}` }];
      } catch (error) {
        logger.error('skill_schedule_list failed:', error);
        throw error;
      }
    }
  };
}

export function skillScheduleCancelTool(clients: BackendClients): Tool {
  return {
    name: 'skill_schedule_cancel',
    description: 'Cancel (soft-delete) a scheduled skill run.',
    inputSchema: {
      type: 'object',
      properties: {
        schedule_id: { type: 'string', description: 'UUID of the schedule to cancel' }
      },
      required: ['schedule_id']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) throw new Error('Authentication required.');

        await clients.schedules.deleteSchedule(args.schedule_id);

        return [{ type: 'text', text: `Schedule ${args.schedule_id} cancelled.` }];
      } catch (error) {
        logger.error('skill_schedule_cancel failed:', error);
        throw error;
      }
    }
  };
}

export function skillScheduleRetriggerTool(clients: BackendClients): Tool {
  return {
    name: 'skill_schedule_retrigger',
    description: 'Re-trigger a failed or completed scheduled run. Resets retry count and re-enables.',
    inputSchema: {
      type: 'object',
      properties: {
        schedule_id: { type: 'string', description: 'UUID of the schedule to retrigger' }
      },
      required: ['schedule_id']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) throw new Error('Authentication required.');

        const result = await clients.schedules.retriggerSchedule(args.schedule_id);

        return [{
          type: 'text',
          text: `Schedule retriggered:\n  ID: ${result.id}\n  Status: ${result.status}\n  Next run: ${result.next_run_at || 'pending'}\n  Retry count reset to 0`
        }];
      } catch (error) {
        logger.error('skill_schedule_retrigger failed:', error);
        throw error;
      }
    }
  };
}

export function skillTasksPendingTool(clients: BackendClients): Tool {
  return {
    name: 'skill_tasks_pending',
    description: 'List only pending/actionable skill tasks: paused executions awaiting LLM response and recent failures needing attention.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Filter by skill UUID' },
        limit: { type: 'number', description: 'Max results (default: 20)' }
      }
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) throw new Error('Authentication required.');

        // Fetch paused executions
        const { logs: paused } = await clients.schedules.listExecutionLogs({
          skill_id: args.skill_id,
          status: 'paused_for_llm',
          limit: args.limit || 20,
          offset: 0
        });

        // Fetch recent failures
        const { logs: failed } = await clients.schedules.listExecutionLogs({
          skill_id: args.skill_id,
          status: 'failed',
          limit: args.limit || 20,
          offset: 0
        });

        const all = [...paused, ...failed];
        if (all.length === 0) {
          return [{ type: 'text', text: 'No pending tasks. All executions are up to date.' }];
        }

        const lines = all.map((l: any) => {
          const label = l.status === 'paused_for_llm' ? 'AWAITING LLM' : 'FAILED';
          const scheduleHint = l.scheduled_run_id
            ? `\n  Schedule ID: ${l.scheduled_run_id} (use skill_schedule_retrigger to retry)`
            : '';
          const resumeHint = l.status === 'paused_for_llm'
            ? `\n  Action: Use skill_execute with the skill slug to resume (resume token provided at pause time)`
            : '';
          return `[${label}] Execution: ${l.id}\n  Skill: ${l.skill_id}\n  Started: ${l.started_at}${scheduleHint}${resumeHint}${l.error ? `\n  Error: ${l.error}` : ''}`;
        }).join('\n\n');

        return [{ type: 'text', text: `Pending Tasks (${all.length}):\n\n${lines}\n\nTo retry failed scheduled tasks, use skill_schedule_retrigger with the Schedule ID.` }];
      } catch (error) {
        logger.error('skill_tasks_pending failed:', error);
        throw error;
      }
    }
  };
}

export function skillTaskRetriggerTool(clients: BackendClients): Tool {
  return {
    name: 'skill_task_retrigger',
    description: 'Re-trigger a failed or completed scheduled task. Alias for skill_schedule_retrigger.',
    inputSchema: {
      type: 'object',
      properties: {
        schedule_id: { type: 'string', description: 'UUID of the schedule to retrigger' }
      },
      required: ['schedule_id']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) throw new Error('Authentication required.');

        const result = await clients.schedules.retriggerSchedule(args.schedule_id);

        return [{
          type: 'text',
          text: `Task retriggered:\n  ID: ${result.id}\n  Status: ${result.status}\n  Next run: ${result.next_run_at || 'pending'}\n  Retry count reset to 0`
        }];
      } catch (error) {
        logger.error('skill_task_retrigger failed:', error);
        throw error;
      }
    }
  };
}

export function skillTasksListTool(clients: BackendClients): Tool {
  return {
    name: 'skill_tasks_list',
    description: 'List skill execution logs (task history). Shows completed, failed, running, and paused executions.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Filter by skill UUID' },
        status: { type: 'string', description: 'Filter by status (running, completed, failed, cancelled, paused_for_llm)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
        offset: { type: 'number', description: 'Offset for pagination (default: 0)' }
      }
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) throw new Error('Authentication required.');

        const { logs } = await clients.schedules.listExecutionLogs({
          skill_id: args.skill_id,
          status: args.status,
          limit: args.limit || 20,
          offset: args.offset || 0
        });

        if (logs.length === 0) {
          return [{ type: 'text', text: 'No execution logs found.' }];
        }

        const lines = logs.map((l: any) =>
          `[${l.status.toUpperCase()}] ${l.id}\n  Skill: ${l.skill_id}\n  Duration: ${l.total_duration_ms || 0}ms\n  Started: ${l.started_at}${l.completed_at ? ` | Completed: ${l.completed_at}` : ''}${l.error ? `\n  Error: ${l.error}` : ''}`
        ).join('\n\n');

        return [{ type: 'text', text: `Execution Logs (${logs.length}):\n\n${lines}` }];
      } catch (error) {
        logger.error('skill_tasks_list failed:', error);
        throw error;
      }
    }
  };
}
