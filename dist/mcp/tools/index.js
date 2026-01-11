/**
 * MCP Tools Router
 *
 * Exports all available tools for the MCP server.
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
// Collections - PostgreSQL version with UUID support and consolidation
import { createCollectionTool, listCollectionsTool, getCollectionTool, addToCollectionTool, removeFromCollectionTool, updateCollectionTool, deleteCollectionTool, consolidateCollectionTool } from './collections.js';
export function setupTools(clients) {
    return {
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
        // Collection tools - PostgreSQL version with all 8 tools
        create_collection: createCollectionTool(clients),
        list_collections: listCollectionsTool(clients),
        get_collection: getCollectionTool(clients),
        add_to_collection: addToCollectionTool(clients),
        remove_from_collection: removeFromCollectionTool(clients),
        update_collection: updateCollectionTool(clients),
        delete_collection: deleteCollectionTool(clients),
        consolidate_collection: consolidateCollectionTool(clients),
    };
}
//# sourceMappingURL=index.js.map