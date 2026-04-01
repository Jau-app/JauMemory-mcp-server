/**
 * Category Router - Groups tools into categories for lazy loading.
 *
 * In "grouped" mode, tools/list returns one tool per category.
 * Calling with action="list" returns sub-tool schemas.
 * Calling with action="<sub_tool>" dispatches to the real handler.
 */

import type { Tool } from './index.js';

export interface CategoryDefinition {
  name: string;
  description: string;
  tools: Record<string, Tool>;
}

/**
 * Build a category tool that wraps a group of sub-tools.
 *
 * - action="list" → returns names, descriptions, and inputSchemas
 * - action="<name>" → validates and dispatches to the sub-tool handler
 */
export function buildCategoryTool(def: CategoryDefinition): Tool {
  const subNames = Object.keys(def.tools);
  const subList = subNames.map(n => `${n}: ${def.tools[n].description.substring(0, 80)}`).join('\n  ');

  return {
    name: def.name,
    description: `${def.description}\n\nAvailable actions (call with action="list" for full details):\n  ${subList}`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: `One of: list, ${subNames.join(', ')}`
        }
      },
      required: ['action']
    },
    handler: async (args: any) => {
      const action: string = args?.action;
      if (!action) {
        return [{
          type: 'text',
          text: `Missing "action" parameter. Use action="list" or one of: ${subNames.join(', ')}`
        }];
      }

      // List sub-tools with full schemas
      if (action === 'list') {
        const listing = subNames.map(name => {
          const t = def.tools[name];
          return {
            name,
            description: t.description,
            inputSchema: t.inputSchema
          };
        });
        return [{
          type: 'text',
          text: JSON.stringify({ category: def.name, tools: listing }, null, 2)
        }];
      }

      // Dispatch to sub-tool
      const tool = def.tools[action];
      if (!tool) {
        return [{
          type: 'text',
          text: `Unknown action "${action}" in category "${def.name}". Available: list, ${subNames.join(', ')}`
        }];
      }

      // Pass all args except "action" to the sub-tool handler
      const { action: _a, ...subArgs } = args;
      return tool.handler(subArgs);
    }
  };
}

/**
 * Category definitions — maps category names to their sub-tool keys.
 * The actual Tool objects are injected at setup time from the flat tool map.
 */
export const CATEGORY_MAP: Record<string, { description: string; toolKeys: string[] }> = {
  memory: {
    description: 'Memory operations — store, search, update, delete, and analyze memories',
    toolKeys: ['remember', 'recall', 'forget', 'update', 'analyze', 'consolidate', 'memory_stats']
  },
  agents: {
    description: 'Agent operations — create agents, manage memories, track errors, reflect',
    toolKeys: ['create_agent', 'list_agents', 'agent_memory', 'agent_error_learning', 'agent_reflection', 'update_agent_name', 'agent_collaboration']
  },
  collections: {
    description: 'Collection operations — group, organize, and consolidate memories',
    toolKeys: ['create_collection', 'list_collections', 'get_collection', 'add_to_collection', 'remove_from_collection', 'update_collection', 'delete_collection', 'consolidate_collection']
  },
  vault: {
    description: 'Credential vault — securely store, list, and rotate API keys and tokens',
    toolKeys: ['vault_store', 'vault_list', 'vault_rotate']
  },
  tools: {
    description: 'Tool registry — register, configure, and call HTTP/API tools',
    toolKeys: ['tool_create', 'tool_update', 'tool_call', 'tool_list', 'tool_render']
  },
  skills: {
    description: 'Skill registry — create, list, render, and execute skill workflows',
    toolKeys: ['skill_create', 'skill_list', 'skill_render', 'toolkit_search', 'skill_execute']
  },
  scheduling: {
    description: 'Skill scheduling — schedule, monitor, and manage recurring skill executions',
    toolKeys: ['skill_schedule', 'skill_schedule_list', 'skill_schedule_cancel', 'skill_schedule_retrigger', 'skill_tasks_pending', 'skill_task_retrigger', 'skill_tasks_list']
  },
  berrry: {
    description: 'Berrry app integration — register existing apps or create new ones as tools',
    toolKeys: ['berrry_register_tool', 'berrry_create_tool']
  }
};

/** Tool keys that are always directly exposed (not grouped) */
export const DIRECT_TOOLS = ['mcp_login', 'mcp_logout', 'search', 'fetch'];

/** Tool keys that are registered but hidden from tools/list in grouped mode */
export const HIDDEN_TOOLS = ['mcp_authenticate'];
