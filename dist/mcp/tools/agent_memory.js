/**
 * Agent Memory Tool
 *
 * Link memories to agents or recall agent-specific memories
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
// Input validation schema
const agentMemorySchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('link'),
        agentId: z.string().describe('Agent ID'),
        memoryId: z.string().describe('Memory ID to link'),
        category: z.string().describe('Memory category'),
        projectContext: z.string().optional().describe('Project name for context')
    }),
    z.object({
        action: z.literal('recall'),
        agentId: z.string().describe('Agent ID'),
        query: z.string().optional().describe('Search query'),
        category: z.string().optional().describe('Filter by category'),
        projectContext: z.string().optional().describe('Filter by project'),
        limit: z.number().min(1).max(100).optional().describe('Max results')
    })
]);
export function agentMemoryTool(clients) {
    return {
        name: 'agent_memory',
        description: `Link memories to agents or recall agent-specific memories.

Usage Examples:
// Link a memory to an agent
agent_memory({
  action: "link",
  agentId: "frontend-dev",
  memoryId: "mem-123-456",
  category: "learning",
  projectContext: "webapp"
})

// Recall all memories for an agent
agent_memory({
  action: "recall",
  agentId: "backend-dev"
})

// Search agent memories
agent_memory({
  action: "recall",
  agentId: "code-reviewer",
  query: "authentication",
  category: "error",
  limit: 10
})

// Project-specific recall
agent_memory({
  action: "recall",
  agentId: "test-engineer",
  projectContext: "api-service",
  category: "task"
})

Memory Categories:
- task: Assigned tasks and TODOs
- learning: Things the agent learned
- error: Errors encountered
- solution: Solutions found
- reflection: Agent reflections`,
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['link', 'recall'],
                    description: 'Action to perform'
                },
                agentId: {
                    type: 'string',
                    description: 'Agent ID'
                },
                memoryId: {
                    type: 'string',
                    description: 'Memory ID (for link action)'
                },
                category: {
                    type: 'string',
                    description: 'Memory category like task, learning, error'
                },
                projectContext: {
                    type: 'string',
                    description: 'Project name for context'
                },
                query: {
                    type: 'string',
                    description: 'Search query (for recall action)'
                },
                limit: {
                    type: 'number',
                    minimum: 1,
                    maximum: 100,
                    description: 'Max results to return'
                }
            },
            required: ['action', 'agentId']
        },
        handler: async (args) => {
            // Validate input
            const input = agentMemorySchema.parse(args);
            try {
                if (input.action === 'link') {
                    // Link memory to agent
                    await clients.agent.linkMemoryToAgent(input.agentId, input.memoryId, input.category, input.projectContext);
                    logger.info('Memory linked to agent', {
                        agentId: input.agentId,
                        memoryId: input.memoryId,
                        category: input.category
                    });
                    return [
                        {
                            type: 'text',
                            text: `Memory ${input.memoryId} linked to agent ${input.agentId} with category: ${input.category}`
                        }
                    ];
                }
                else {
                    // Recall agent memories
                    const memories = await clients.agent.recallAgentMemories({
                        agentId: input.agentId,
                        query: input.query,
                        category: input.category,
                        projectContext: input.projectContext,
                        limit: input.limit
                    });
                    logger.info('Recalled agent memories', {
                        agentId: input.agentId,
                        count: memories.length
                    });
                    if (memories.length === 0) {
                        return [
                            {
                                type: 'text',
                                text: `No memories found for agent ${input.agentId}`
                            }
                        ];
                    }
                    // Format memories
                    let responseText = `Found ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'} for agent ${input.agentId}:\n\n`;
                    memories.forEach((mem, index) => {
                        const memory = mem.memory || {};
                        responseText += `${index + 1}. [${mem.memoryId}] ${memory.content || 'No content'}\n`;
                        responseText += `   Category: ${mem.category}`;
                        if (mem.projectContext) {
                            responseText += ` | Project: ${mem.projectContext}`;
                        }
                        responseText += `\n   Created: ${mem.createdAt.toLocaleString()}\n\n`;
                    });
                    return [
                        {
                            type: 'text',
                            text: responseText.trim()
                        }
                    ];
                }
            }
            catch (error) {
                logger.error('Agent memory operation failed', error);
                throw new Error(`Agent memory operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };
}
//# sourceMappingURL=agent_memory.js.map