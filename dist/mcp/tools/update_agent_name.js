/**
 * Update Agent Name Tool
 *
 * Update an agent's name using the new naming convention
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
// Input validation schema
const updateAgentNameSchema = z.object({
    agentId: z.string().describe('Agent ID to update'),
    newName: z.string().min(1).describe('New name in format "Long Name:shortname"')
});
export function updateAgentNameTool(clients) {
    return {
        name: 'update_agent_name',
        description: `Update an agent's name using the new naming convention.

Usage Examples:
// Update an agent's name
update_agent_name({
  agentId: "DW1",
  newName: "Documentation Writer:dw1"
})

// Change to a different role
update_agent_name({
  agentId: "ta1",
  newName: "Test Automation Engineer:tae1"
})

Name Format Requirements:
- Must include both long name and short name
- Format: "Long Name:shortname"
- Example: "Backend Developer:bd1"
- Short names should be 2-4 characters

This allows agents to be reassigned to different roles as they grow and evolve.`,
        inputSchema: {
            type: 'object',
            properties: {
                agentId: {
                    type: 'string',
                    description: 'Agent ID to update'
                },
                newName: {
                    type: 'string',
                    description: 'New name in format "Long Name:shortname"'
                }
            },
            required: ['agentId', 'newName']
        },
        handler: async (args) => {
            // Validate input
            const input = updateAgentNameSchema.parse(args);
            try {
                // Validate name format
                if (!input.newName.includes(':')) {
                    throw new Error('Name must be in format "Long Name:shortname"');
                }
                const [longName, shortName] = input.newName.split(':');
                if (!longName.trim() || !shortName.trim()) {
                    throw new Error('Both long name and short name are required');
                }
                if (shortName.trim().length < 2 || shortName.trim().length > 4) {
                    throw new Error('Short name should be 2-4 characters');
                }
                // Update agent name
                const agent = await clients.agent.updateAgentName(input.agentId, input.newName);
                logger.info('Agent name updated', {
                    agentId: input.agentId,
                    oldName: agent.name,
                    newName: input.newName
                });
                return [
                    {
                        type: 'text',
                        text: `✅ Agent name updated successfully!\n\nAgent ID: ${agent.id}\nNew Name: ${agent.name}\nStatus: ${agent.status}`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to update agent name', error);
                throw new Error(`Failed to update agent name: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };
}
//# sourceMappingURL=update_agent_name.js.map