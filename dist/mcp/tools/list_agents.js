/**
 * List Agents Tool
 *
 * Lists all available agents with their details
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
// Input validation schema
const listAgentsSchema = z.object({
    status: z.enum(['active', 'learning', 'error', 'archived']).optional()
        .describe('Filter by status')
});
export function listAgentsTool(clients) {
    return {
        name: 'list_agents',
        description: `List all available agents with their details.

Usage Examples:
// List all agents
list_agents({})

// List only active agents
list_agents({ status: "active" })

// List agents in error state
list_agents({ status: "error" })

Agent Statuses:
- active: Ready for tasks
- learning: Currently improving from errors
- error: Encountered issues, needs attention
- archived: No longer in use`,
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['active', 'learning', 'error', 'archived'],
                    description: 'Filter by status'
                }
            }
        },
        handler: async (args) => {
            // Validate input
            const input = listAgentsSchema.parse(args || {});
            try {
                // List agents
                const agents = await clients.agent.listAgents(input.status);
                logger.info('Listed agents', {
                    count: agents.length,
                    status: input.status
                });
                if (agents.length === 0) {
                    return [
                        {
                            type: 'text',
                            text: input.status
                                ? `No agents found with status: ${input.status}`
                                : 'No agents found'
                        }
                    ];
                }
                // Format agents list
                let responseText = `Found ${agents.length} agent${agents.length === 1 ? '' : 's'}:\n\n`;
                agents.forEach(agent => {
                    responseText += `**${agent.name}** (${agent.id})\n`;
                    responseText += `  Status: ${agent.status}\n`;
                    if (agent.personalityTraits.length > 0) {
                        responseText += `  Personality: ${agent.personalityTraits.join(', ')}\n`;
                    }
                    if (agent.specializations.length > 0) {
                        responseText += `  Specializations: ${agent.specializations.join(', ')}\n`;
                    }
                    responseText += `  Created: ${agent.createdAt.toLocaleString()}\n\n`;
                });
                return [
                    {
                        type: 'text',
                        text: responseText.trim()
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to list agents', error);
                throw new Error(`Failed to list agents: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };
}
//# sourceMappingURL=list_agents.js.map