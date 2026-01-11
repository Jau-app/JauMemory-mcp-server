/**
 * Agent Reflection Tool
 *
 * Create and retrieve agent reflections for continuous improvement
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
// Input validation schema
const agentReflectionSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('create'),
        agentId: z.string().describe('Agent ID'),
        reflectionType: z.enum(['learning', 'mistake', 'success', 'collaboration'])
            .describe('Type of reflection'),
        content: z.string().describe('Reflection content'),
        lessonsLearned: z.array(z.string()).optional().describe('Key takeaways'),
        relatedAgents: z.array(z.string()).optional().describe('Other agents involved')
    }),
    z.object({
        action: z.literal('list'),
        agentId: z.string().describe('Agent ID'),
        reflectionType: z.enum(['learning', 'mistake', 'success', 'collaboration']).optional()
            .describe('Filter by type')
    })
]);
export function agentReflectionTool(clients) {
    return {
        name: 'agent_reflection',
        description: `Create and retrieve agent reflections for continuous improvement.

Usage Examples:
// Create a learning reflection
agent_reflection({
  action: "create",
  agentId: "frontend-dev",
  reflectionType: "learning",
  content: "Discovered that React.memo can prevent unnecessary re-renders in large lists",
  lessonsLearned: [
    "Use React.memo for expensive components",
    "Profile before optimizing",
    "Not all components need memoization"
  ]
})

// Create a mistake reflection
agent_reflection({
  action: "create",
  agentId: "backend-dev",
  reflectionType: "mistake",
  content: "Forgot to add database indexes, causing slow queries in production",
  lessonsLearned: [
    "Always analyze query patterns before deployment",
    "Add indexes for frequently filtered columns",
    "Monitor query performance in staging"
  ]
})

// Create a collaboration reflection
agent_reflection({
  action: "create",
  agentId: "code-reviewer",
  reflectionType: "collaboration",
  content: "Worked with frontend-dev to establish better PR review guidelines",
  lessonsLearned: [
    "Clear PR descriptions save review time",
    "Automated checks reduce manual review burden"
  ],
  relatedAgents: ["frontend-dev", "test-engineer"]
})

// List all reflections for an agent
agent_reflection({
  action: "list",
  agentId: "test-engineer"
})

// List specific type of reflections
agent_reflection({
  action: "list",
  agentId: "project-manager",
  reflectionType: "success"
})

Reflection Types:
- learning: New knowledge or insights gained
- mistake: Errors made and lessons learned
- success: Achievements and what worked well
- collaboration: Insights from working with other agents`,
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'list'],
                    description: 'Action to perform'
                },
                agentId: {
                    type: 'string',
                    description: 'Agent ID'
                },
                reflectionType: {
                    type: 'string',
                    enum: ['learning', 'mistake', 'success', 'collaboration'],
                    description: 'Type of reflection'
                },
                content: {
                    type: 'string',
                    description: 'Reflection content (for create)'
                },
                lessonsLearned: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key takeaways'
                },
                relatedAgents: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Other agents involved'
                }
            },
            required: ['action', 'agentId']
        },
        handler: async (args) => {
            // Validate input
            const input = agentReflectionSchema.parse(args);
            try {
                if (input.action === 'create') {
                    // Create reflection
                    await clients.agent.createReflection({
                        agentId: input.agentId,
                        reflectionType: input.reflectionType,
                        content: input.content,
                        lessonsLearned: input.lessonsLearned,
                        relatedAgents: input.relatedAgents
                    });
                    logger.info('Reflection created', {
                        agentId: input.agentId,
                        reflectionType: input.reflectionType
                    });
                    let responseText = `✨ ${input.reflectionType.charAt(0).toUpperCase() + input.reflectionType.slice(1)} reflection created!\n\n`;
                    responseText += `**Content:** ${input.content}\n`;
                    if (input.lessonsLearned?.length) {
                        responseText += `\n**Lessons Learned:**\n`;
                        input.lessonsLearned.forEach((lesson, i) => {
                            responseText += `${i + 1}. ${lesson}\n`;
                        });
                    }
                    if (input.relatedAgents?.length) {
                        responseText += `\n**Related Agents:** ${input.relatedAgents.join(', ')}`;
                    }
                    return [
                        {
                            type: 'text',
                            text: responseText
                        }
                    ];
                }
                else {
                    // List reflections
                    const reflections = await clients.agent.getAgentReflections(input.agentId, input.reflectionType);
                    logger.info('Listed reflections', {
                        agentId: input.agentId,
                        count: reflections.length,
                        type: input.reflectionType
                    });
                    if (reflections.length === 0) {
                        return [
                            {
                                type: 'text',
                                text: input.reflectionType
                                    ? `No ${input.reflectionType} reflections found for agent ${input.agentId}`
                                    : `No reflections found for agent ${input.agentId}`
                            }
                        ];
                    }
                    // Format reflections
                    let responseText = `Found ${reflections.length} reflection${reflections.length === 1 ? '' : 's'} for agent ${input.agentId}:\n\n`;
                    const typeEmojis = {
                        learning: '📚',
                        mistake: '❌',
                        success: '✅',
                        collaboration: '🤝'
                    };
                    reflections.forEach((reflection, index) => {
                        const emoji = typeEmojis[reflection.reflectionType] || '💭';
                        responseText += `${index + 1}. ${emoji} **${reflection.reflectionType}** (${reflection.createdAt.toLocaleString()})\n`;
                        responseText += `   ${reflection.content}\n`;
                        if (reflection.lessonsLearned.length > 0) {
                            responseText += `   Lessons: ${reflection.lessonsLearned.join('; ')}\n`;
                        }
                        responseText += '\n';
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
                logger.error('Reflection operation failed', error);
                throw new Error(`Reflection operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };
}
//# sourceMappingURL=agent_reflection.js.map