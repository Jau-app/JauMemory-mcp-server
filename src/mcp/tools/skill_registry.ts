/**
 * Skill Registry Tools
 *
 * MCP tools for creating and managing composed skill workflows.
 * Skills chain multiple tools together into reusable workflows.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';

export function skillCreateTool(clients: BackendClients): Tool {
  return {
    name: 'skill_create',
    description: 'Create a new skill workflow. A skill chains multiple tools together with input/output mappings, conditional steps, and trigger phrases.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable name for the skill (e.g. "Summarize and Translate")'
        },
        skill_type: {
          type: 'string',
          description: 'Type of skill: workflow, converter, generator, analyzer, connector',
          enum: ['workflow', 'converter', 'generator', 'analyzer', 'connector']
        },
        description: {
          type: 'string',
          description: 'Description of what the skill does'
        },
        trigger_phrases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Natural language phrases that activate this skill (e.g. ["summarize this", "give me a summary"])'
        },
        category_id: {
          type: 'string',
          description: 'UUID of the category to assign this skill to'
        },
        workflow_steps_json: {
          type: 'string',
          description: 'JSON array defining workflow steps (advanced). Prefer using skill_add_step for step-by-step configuration.'
        },
        input_schema_json: {
          type: 'string',
          description: 'JSON Schema for the skill input (optional)'
        },
        output_schema_json: {
          type: 'string',
          description: 'JSON Schema for the skill output (optional)'
        },
        is_public: {
          type: 'boolean',
          description: 'Whether this skill is visible to other users (default: false)'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization and search'
        },
        pipeline_json: {
          type: 'string',
          description: 'JSON array of pipeline steps. Each step has a "type" (tool, llm_transform, transform_function, llm_router, condition, terminal) and an "id". Default chaining: output of step N becomes input of step N+1.'
        },
        tldr_json: {
          type: 'string',
          description: 'JSON object with "objective" and "tools" array describing the skill at a high level'
        },
        safety_limits_json: {
          type: 'string',
          description: 'JSON object with max_iterations, max_total_steps, max_duration_ms. Defaults to {max_iterations:100, max_total_steps:50, max_duration_ms:300000}'
        }
      },
      required: ['name', 'skill_type']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const response = await clients.skills.createSkill({
          name: args.name,
          skill_type: args.skill_type,
          description: args.description,
          trigger_phrases: args.trigger_phrases,
          category_id: args.category_id,
          workflow_steps_json: args.workflow_steps_json,
          input_schema_json: args.input_schema_json,
          output_schema_json: args.output_schema_json,
          is_public: args.is_public,
          tags: args.tags,
          pipeline_json: args.pipeline_json,
          tldr_json: args.tldr_json,
          safety_limits_json: args.safety_limits_json
        });

        const pipelineSteps = response.pipeline_json ? JSON.parse(response.pipeline_json) : [];
        return [
          {
            type: 'text',
            text: `Skill created successfully!
ID: ${response.id}
Name: ${response.name}
Slug: ${response.slug}
Type: ${response.skill_type}
${response.trigger_phrases.length > 0 ? `Triggers: ${response.trigger_phrases.join(', ')}` : ''}
${response.category_name ? `Category: ${response.category_name}` : ''}
Active: ${response.is_active ? 'Yes' : 'No'}
Tool Steps: ${response.tool_steps ? response.tool_steps.length : 0}
Pipeline Steps: ${pipelineSteps.length}`
          }
        ];
      } catch (error) {
        logger.error('Failed to create skill:', error);
        throw error;
      }
    }
  };
}

export function skillListTool(clients: BackendClients): Tool {
  return {
    name: 'skill_list',
    description: 'List your skills. Supports filtering by type, category, and full-text search.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_type: {
          type: 'string',
          description: 'Filter by skill type (workflow, converter, generator, analyzer, connector)'
        },
        category_id: {
          type: 'string',
          description: 'Filter by category UUID'
        },
        active_only: {
          type: 'boolean',
          description: 'Only show active skills (default: false)'
        },
        include_public: {
          type: 'boolean',
          description: 'Include public skills from other users'
        },
        search: {
          type: 'string',
          description: 'Full-text search on name and description'
        }
      },
      required: []
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const response = await clients.skills.listSkills({
          skill_type: args.skill_type,
          category_id: args.category_id,
          active_only: args.active_only,
          include_public: args.include_public,
          search: args.search
        });

        if (!response.skills || response.skills.length === 0) {
          return [
            {
              type: 'text',
              text: 'No skills found. Create one with skill_create!'
            }
          ];
        }

        const lines = response.skills.map((s: any) => {
          const stepCount = s.tool_steps ? s.tool_steps.length : 0;
          return `[${s.slug}] ${s.name} (${s.skill_type})${s.category_name ? ` | ${s.category_name}` : ''}
   ${s.description ? s.description.substring(0, 80) : 'No description'}
   Steps: ${stepCount} | Uses: ${s.usage_count}${s.trigger_phrases.length > 0 ? ` | Triggers: ${s.trigger_phrases.slice(0, 3).join(', ')}` : ''}`;
        }).join('\n\n');

        return [
          {
            type: 'text',
            text: `Your Skills (${response.total} total):\n\n${lines}`
          }
        ];
      } catch (error) {
        logger.error('Failed to list skills:', error);
        throw error;
      }
    }
  };
}

export function skillRenderTool(clients: BackendClients): Tool {
  return {
    name: 'skill_render',
    description: 'Render a skill as a human-readable markdown document. Includes all linked tool documentation with credentials redacted.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: 'UUID of the skill to render'
        }
      },
      required: ['skill_id']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const response = await clients.skills.renderSkill(args.skill_id);

        return [
          {
            type: 'text',
            text: response.markdown
          }
        ];
      } catch (error) {
        logger.error('Failed to render skill:', error);
        throw error;
      }
    }
  };
}
