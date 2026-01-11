/**
 * Create Agent Tool
 *
 * Creates a new agent with personality traits and specializations
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
// Input validation schema
const createAgentSchema = z.object({
    name: z.string().min(1).describe('Agent name'),
    personalityTraits: z.array(z.string()).optional().describe('Personality traits like curious, analytical, creative'),
    specializations: z.array(z.string()).optional().describe('Areas of expertise like frontend, backend, testing'),
    updatePrompts: z.array(z.string()).optional().describe('Custom prompts for agent updates'),
    id: z.string().optional().describe('Optional agent ID (if not provided, will be auto-generated)'),
    initialLearningRate: z.number().min(0).max(1).optional().describe('Initial learning rate (0.0-1.0, default: 0.5)')
});
export function createAgentTool(clients) {
    return {
        name: 'create_agent',
        description: `Create a new agent with personality traits and specializations.

Usage Examples:
// Basic agent
create_agent({ name: "Code Reviewer" })

// Agent with personality
create_agent({
  name: "Frontend Expert",
  personalityTraits: ["detail-oriented", "creative", "user-focused"],
  specializations: ["React", "TypeScript", "CSS", "UX"]
})

// Agent with custom prompts
create_agent({
  name: "Test Engineer",
  personalityTraits: ["thorough", "systematic"],
  specializations: ["Jest", "Cypress", "TDD"],
  updatePrompts: [
    "Always consider edge cases",
    "Write tests before implementing fixes"
  ]
})

Pre-configured Agents (from migration):
- code-reviewer: Analytical, detail-oriented reviewer
- backend-dev: Systems thinker for backend development
- frontend-dev: Creative UI/UX focused developer
- test-engineer: Quality-focused testing specialist
- project-manager: Organized project coordinator`,
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Agent name'
                },
                personalityTraits: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Personality traits like curious, analytical, creative'
                },
                specializations: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Areas of expertise like frontend, backend, testing'
                },
                updatePrompts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Custom prompts for agent updates'
                },
                id: {
                    type: 'string',
                    description: 'Optional agent ID (if not provided, will be auto-generated)'
                },
                initialLearningRate: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: 'Initial learning rate (0.0-1.0, default: 0.5)'
                }
            },
            required: ['name']
        },
        handler: async (args) => {
            // Validate input
            const input = createAgentSchema.parse(args);
            try {
                const userId = await clients.auth.getCurrentUserId();
                // Create the agent
                const agent = await clients.agent.createAgent({
                    name: input.name,
                    personalityTraits: input.personalityTraits,
                    specializations: input.specializations,
                    updatePrompts: input.updatePrompts,
                    createdBy: userId,
                    id: input.id,
                    initialLearningRate: input.initialLearningRate
                });
                logger.info('Agent created', {
                    agentId: agent.id,
                    name: agent.name
                });
                let responseText = `Agent "${agent.name}" created successfully with ID: ${agent.id}`;
                if (agent.personalityTraits.length > 0) {
                    responseText += `\nPersonality: ${agent.personalityTraits.join(', ')}`;
                }
                if (agent.specializations.length > 0) {
                    responseText += `\nSpecializations: ${agent.specializations.join(', ')}`;
                }
                responseText += `\nStatus: ${agent.status}`;
                return [
                    {
                        type: 'text',
                        text: responseText
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to create agent', error);
                // Check if it's a cancellation error
                if (error.code === 1 || error.code === 'CANCELLED' || error.message?.includes('CANCELLED')) {
                    // Try to provide more helpful error message
                    const errorMsg = `Agent creation request was cancelled, but the agent might have been created successfully. ` +
                        `Try creating with a different name or check if agent "${input.name}" exists.`;
                    throw new Error(errorMsg);
                }
                throw new Error(`Failed to create agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };
}
//# sourceMappingURL=create_agent.js.map