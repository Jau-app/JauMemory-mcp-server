/**
 * Search Tool - Required by ChatGPT OAuth MCP specification
 *
 * Returns search results for actual JauMemory tools and capabilities.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';

interface SearchResult {
  id: string;
  title: string;
  url: string;
}

export function search(_clients: BackendClients): Tool {
  return {
    name: 'search',
    description: 'Search for JauMemory tools and capabilities. Returns actual tool names and documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for JauMemory tools or capabilities'
        }
      },
      required: ['query']
    },
    handler: async (args: { query: string }) => {
      const { query } = args;

      // Our actual JauMemory tools
      const allTools: SearchResult[] = [
        // Authentication tools
        {
          id: "mcp_login",
          title: "mcp_login - Initiate MCP authentication flow",
          url: "/api/v1/mcp/fetch?id=mcp_login"
        },
        {
          id: "mcp_authenticate",
          title: "mcp_authenticate - Complete MCP authentication with token",
          url: "/api/v1/mcp/fetch?id=mcp_authenticate"
        },
        {
          id: "mcp_logout",
          title: "mcp_logout - Logout and revoke MCP session",
          url: "/api/v1/mcp/fetch?id=mcp_logout"
        },

        // Memory tools
        {
          id: "remember",
          title: "remember - Store new memory with automatic classification",
          url: "/api/v1/mcp/fetch?id=remember"
        },
        {
          id: "recall",
          title: "recall - Search memories by keyword or semantic similarity",
          url: "/api/v1/mcp/fetch?id=recall"
        },
        {
          id: "forget",
          title: "forget - Delete specific memory from system",
          url: "/api/v1/mcp/fetch?id=forget"
        },
        {
          id: "analyze",
          title: "analyze - Analyze memory patterns and extract insights",
          url: "/api/v1/mcp/fetch?id=analyze"
        },
        {
          id: "consolidate",
          title: "consolidate - Consolidate similar memories and extract insights",
          url: "/api/v1/mcp/fetch?id=consolidate"
        },
        {
          id: "update",
          title: "update - Update existing memory content and metadata",
          url: "/api/v1/mcp/fetch?id=update"
        },
        {
          id: "memory_stats",
          title: "memory_stats - Get statistics about memories with filtering",
          url: "/api/v1/mcp/fetch?id=memory_stats"
        },

        // Agent tools
        {
          id: "create_agent",
          title: "create_agent - Create new agent with personality traits",
          url: "/api/v1/mcp/fetch?id=create_agent"
        },
        {
          id: "list_agents",
          title: "list_agents - List all available agents with details",
          url: "/api/v1/mcp/fetch?id=list_agents"
        },
        {
          id: "agent_memory",
          title: "agent_memory - Link memories to agents or recall agent-specific memories",
          url: "/api/v1/mcp/fetch?id=agent_memory"
        },
        {
          id: "agent_error_learning",
          title: "agent_error_learning - Enable agents to learn from errors using 2-strike protocol",
          url: "/api/v1/mcp/fetch?id=agent_error_learning"
        },
        {
          id: "agent_reflection",
          title: "agent_reflection - Create and retrieve agent reflections",
          url: "/api/v1/mcp/fetch?id=agent_reflection"
        },
        {
          id: "update_agent_name",
          title: "update_agent_name - Update agent name using new naming convention",
          url: "/api/v1/mcp/fetch?id=update_agent_name"
        },
        {
          id: "agent_collaboration",
          title: "agent_collaboration - Manage collaboration between agents",
          url: "/api/v1/mcp/fetch?id=agent_collaboration"
        },

        // Collection tools
        {
          id: "create_collection",
          title: "create_collection - Create new collection for organizing memories",
          url: "/api/v1/mcp/fetch?id=create_collection"
        },
        {
          id: "list_collections",
          title: "list_collections - List all collections",
          url: "/api/v1/mcp/fetch?id=list_collections"
        },
        {
          id: "get_collection",
          title: "get_collection - Get details of specific collection including memories",
          url: "/api/v1/mcp/fetch?id=get_collection"
        },
        {
          id: "add_to_collection",
          title: "add_to_collection - Add memory to collection",
          url: "/api/v1/mcp/fetch?id=add_to_collection"
        },
        {
          id: "remove_from_collection",
          title: "remove_from_collection - Remove memory from collection",
          url: "/api/v1/mcp/fetch?id=remove_from_collection"
        },
        {
          id: "update_collection",
          title: "update_collection - Update collection details",
          url: "/api/v1/mcp/fetch?id=update_collection"
        },
        {
          id: "delete_collection",
          title: "delete_collection - Delete collection (memories not deleted)",
          url: "/api/v1/mcp/fetch?id=delete_collection"
        },
        {
          id: "consolidate_collection",
          title: "consolidate_collection - Consolidate all memories in collection into summary",
          url: "/api/v1/mcp/fetch?id=consolidate_collection"
        },

        // Vault tools
        { id: "vault_store", title: "vault_store - Store API credential securely in encrypted vault", url: "/api/v1/mcp/fetch?id=vault_store" },
        { id: "vault_list", title: "vault_list - List stored credentials (values always masked)", url: "/api/v1/mcp/fetch?id=vault_list" },
        { id: "vault_rotate", title: "vault_rotate - Rotate credential secret value", url: "/api/v1/mcp/fetch?id=vault_rotate" },

        // Tool registry
        { id: "tool_create", title: "tool_create - Register HTTP/API endpoint as a callable tool", url: "/api/v1/mcp/fetch?id=tool_create" },
        { id: "tool_update", title: "tool_update - Update registered tool configuration", url: "/api/v1/mcp/fetch?id=tool_update" },
        { id: "tool_call", title: "tool_call - Execute registered tool with automatic credential injection", url: "/api/v1/mcp/fetch?id=tool_call" },
        { id: "tool_list", title: "tool_list - List registered tools with filtering", url: "/api/v1/mcp/fetch?id=tool_list" },
        { id: "tool_render", title: "tool_render - Render tool as human-readable documentation", url: "/api/v1/mcp/fetch?id=tool_render" },

        // Skill registry
        { id: "skill_create", title: "skill_create - Create skill workflow chaining multiple tools", url: "/api/v1/mcp/fetch?id=skill_create" },
        { id: "skill_list", title: "skill_list - List skill workflows with filtering", url: "/api/v1/mcp/fetch?id=skill_list" },
        { id: "skill_render", title: "skill_render - Render skill as human-readable documentation", url: "/api/v1/mcp/fetch?id=skill_render" },

        // Toolkit search and execution
        { id: "toolkit_search", title: "toolkit_search - Unified search across tools and skills", url: "/api/v1/mcp/fetch?id=toolkit_search" },
        { id: "skill_execute", title: "skill_execute - Execute skill workflow with automatic credential injection", url: "/api/v1/mcp/fetch?id=skill_execute" },

        // Berrry integration
        { id: "berrry_register_tool", title: "berrry_register_tool - Register existing Berrry app as a tool", url: "/api/v1/mcp/fetch?id=berrry_register_tool" },
        { id: "berrry_create_tool", title: "berrry_create_tool - Create new Berrry app and register as tool", url: "/api/v1/mcp/fetch?id=berrry_create_tool" },

        // Skill scheduling
        { id: "skill_schedule", title: "skill_schedule - Schedule skill for recurring cron-based execution", url: "/api/v1/mcp/fetch?id=skill_schedule" },
        { id: "skill_schedule_list", title: "skill_schedule_list - List scheduled skill runs", url: "/api/v1/mcp/fetch?id=skill_schedule_list" },
        { id: "skill_schedule_cancel", title: "skill_schedule_cancel - Cancel scheduled skill run", url: "/api/v1/mcp/fetch?id=skill_schedule_cancel" },
        { id: "skill_schedule_retrigger", title: "skill_schedule_retrigger - Re-trigger failed or completed schedule", url: "/api/v1/mcp/fetch?id=skill_schedule_retrigger" },
        { id: "skill_tasks_pending", title: "skill_tasks_pending - List pending tasks needing attention", url: "/api/v1/mcp/fetch?id=skill_tasks_pending" },
        { id: "skill_task_retrigger", title: "skill_task_retrigger - Re-trigger failed task execution", url: "/api/v1/mcp/fetch?id=skill_task_retrigger" },
        { id: "skill_tasks_list", title: "skill_tasks_list - List skill execution logs and history", url: "/api/v1/mcp/fetch?id=skill_tasks_list" }
      ];

      // Filter results based on query
      const queryLower = query.toLowerCase();
      const filteredResults = allTools.filter(tool =>
        tool.id.toLowerCase().includes(queryLower) ||
        tool.title.toLowerCase().includes(queryLower)
      );

      // If no matches, return all tools (up to 10)
      const results = filteredResults.length > 0 ? filteredResults : allTools.slice(0, 10);

      // Return as array — index.ts wraps in { content: [...] }
      return [
        {
          type: "text",
          text: JSON.stringify({ results })
        }
      ];
    }
  };
}