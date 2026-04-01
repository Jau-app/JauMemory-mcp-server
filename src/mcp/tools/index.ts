/**
 * MCP Tools Router
 *
 * Supports two modes via MCP_TOOL_LOADING env var:
 *   "flat"    (default) — all 43 tools in tools/list
 *   "grouped" — 12 tools: 8 category routers + 4 direct tools
 *               (mcp_authenticate hidden, schema provided by mcp_login response)
 */

import { rememberTool } from './remember.js';
import { recallTool } from './recall.js';
import { forgetTool } from './forget.js';
import { analyzeTool } from './analyze.js';
import { consolidateTool } from './consolidate.js';
import { updateTool } from './update.js';
import { memoryStatsTool } from './memory_stats.js';
import { loginTool } from './login.js';
import { authenticateTool } from './authenticate.js';
import { logoutTool } from './logout.js';
// Agent tools
import { createAgentTool } from './create_agent.js';
import { listAgentsTool } from './list_agents.js';
import { agentMemoryTool } from './agent_memory.js';
import { agentErrorLearningTool } from './agent_error_learning.js';
import { agentReflectionTool } from './agent_reflection.js';
import { updateAgentNameTool } from './update_agent_name.js';
import { agentCollaborationTool } from './agent_collaboration.js';
// ChatGPT OAuth required tools
import { search } from './search.js';
import { fetch } from './fetch.js';
// Collections - PostgreSQL version with UUID support and consolidation
import {
  createCollectionTool,
  listCollectionsTool,
  getCollectionTool,
  addToCollectionTool,
  removeFromCollectionTool,
  updateCollectionTool,
  deleteCollectionTool,
  consolidateCollectionTool
} from './collections.js';
// Vault - Credential management
import { vaultStoreTool, vaultListTool, vaultRotateTool } from './vault.js';
// Tool Registry
import { toolCreateTool, toolCallTool, toolListTool, toolRenderTool, toolUpdateTool } from './tool_registry.js';
// Skill Registry
import { skillCreateTool, skillListTool, skillRenderTool } from './skill_registry.js';
// Toolkit Search & Skill Execution
import { toolkitSearchTool, skillExecuteTool } from './toolkit_search.js';
// Berrry convenience tools
import { berrryRegisterToolTool, berrryCreateToolTool } from './berrry.js';
// Skill Scheduling & Task History
import {
  skillScheduleTool,
  skillScheduleListTool,
  skillScheduleCancelTool,
  skillScheduleRetriggerTool,
  skillTasksPendingTool,
  skillTaskRetriggerTool,
  skillTasksListTool
} from './skill_schedule.js';
// Category router
import { buildCategoryTool, CATEGORY_MAP, DIRECT_TOOLS, HIDDEN_TOOLS } from './category_router.js';

import type { BackendClients } from '../../types/clients.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<any>;
}

/** Build the complete flat tool map (all 43 tools) */
function buildFlatTools(clients: BackendClients): Record<string, Tool> {
  return {
    // ChatGPT OAuth required tools
    search: search(clients),
    fetch: fetch(clients),

    // Authentication tools
    mcp_login: loginTool(clients),
    mcp_authenticate: authenticateTool(clients),
    mcp_logout: logoutTool(clients),

    // Memory tools
    remember: rememberTool(clients),
    recall: recallTool(clients),
    forget: forgetTool(clients),
    analyze: analyzeTool(clients),
    consolidate: consolidateTool(clients),
    update: updateTool(clients),
    memory_stats: memoryStatsTool(clients),

    // Agent tools
    create_agent: createAgentTool(clients),
    list_agents: listAgentsTool(clients),
    agent_memory: agentMemoryTool(clients),
    agent_error_learning: agentErrorLearningTool(clients),
    agent_reflection: agentReflectionTool(clients),
    update_agent_name: updateAgentNameTool(clients),
    agent_collaboration: agentCollaborationTool(clients),

    // Collection tools
    create_collection: createCollectionTool(clients),
    list_collections: listCollectionsTool(clients),
    get_collection: getCollectionTool(clients),
    add_to_collection: addToCollectionTool(clients),
    remove_from_collection: removeFromCollectionTool(clients),
    update_collection: updateCollectionTool(clients),
    delete_collection: deleteCollectionTool(clients),
    consolidate_collection: consolidateCollectionTool(clients),

    // Vault tools
    vault_store: vaultStoreTool(clients),
    vault_list: vaultListTool(clients),
    vault_rotate: vaultRotateTool(clients),

    // Tool registry tools
    tool_create: toolCreateTool(clients),
    tool_update: toolUpdateTool(clients),
    tool_call: toolCallTool(clients),
    tool_list: toolListTool(clients),
    tool_render: toolRenderTool(clients),

    // Skill registry tools
    skill_create: skillCreateTool(clients),
    skill_list: skillListTool(clients),
    skill_render: skillRenderTool(clients),

    // Toolkit search & skill execution
    toolkit_search: toolkitSearchTool(clients),
    skill_execute: skillExecuteTool(clients),

    // Berrry convenience tools
    berrry_register_tool: berrryRegisterToolTool(clients),
    berrry_create_tool: berrryCreateToolTool(clients),

    // Skill scheduling & task history
    skill_schedule: skillScheduleTool(clients),
    skill_schedule_list: skillScheduleListTool(clients),
    skill_schedule_cancel: skillScheduleCancelTool(clients),
    skill_schedule_retrigger: skillScheduleRetriggerTool(clients),
    skill_tasks_pending: skillTasksPendingTool(clients),
    skill_task_retrigger: skillTaskRetriggerTool(clients),
    skill_tasks_list: skillTasksListTool(clients),
  };
}

/** Build grouped tools: category routers + direct tools. Hidden tools still callable. */
function buildGroupedTools(clients: BackendClients): {
  listed: Record<string, Tool>;
  all: Record<string, Tool>;
} {
  const flat = buildFlatTools(clients);

  // Build category router tools
  const listed: Record<string, Tool> = {};
  for (const [catName, catDef] of Object.entries(CATEGORY_MAP)) {
    const subTools: Record<string, Tool> = {};
    for (const key of catDef.toolKeys) {
      if (flat[key]) subTools[key] = flat[key];
    }
    listed[catName] = buildCategoryTool({
      name: catName,
      description: catDef.description,
      tools: subTools
    });
  }

  // Add direct tools
  for (const key of DIRECT_TOOLS) {
    if (flat[key]) listed[key] = flat[key];
  }

  // All = listed + hidden (hidden tools are callable but not in tools/list)
  const all: Record<string, Tool> = { ...listed };
  for (const key of HIDDEN_TOOLS) {
    if (flat[key]) all[key] = flat[key];
  }

  return { listed, all };
}

/**
 * Setup tools based on MCP_TOOL_LOADING mode.
 *
 * Returns { listed, all }:
 *   - listed: tools to show in tools/list
 *   - all: tools that can be called (includes hidden ones in grouped mode)
 *
 * In flat mode, listed === all.
 */
export function setupTools(clients: BackendClients): {
  listed: Record<string, Tool>;
  all: Record<string, Tool>;
} {
  const mode = process.env.MCP_TOOL_LOADING || 'flat';

  if (mode === 'grouped') {
    return buildGroupedTools(clients);
  }

  // Flat mode — all tools visible
  const flat = buildFlatTools(clients);
  return { listed: flat, all: flat };
}
