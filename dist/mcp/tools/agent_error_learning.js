/**
 * Agent Error Learning Tool
 *
 * Enable agents to learn from errors using a 2-strike protocol
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
// Input validation schema
const agentErrorLearningSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('report'),
        agentId: z.string().describe('Agent ID'),
        errorSignature: z.string().describe('Unique error identifier'),
        errorMessage: z.string().describe('Error message'),
        contextSnapshot: z.string().optional().describe('Code/context where error occurred'),
        attemptedSolution: z.string().optional().describe('What was tried'),
        projectContext: z.string().optional().describe('Project name')
    }),
    z.object({
        action: z.literal('solve'),
        agentId: z.string().describe('Agent ID'),
        patternId: z.string().describe('Error pattern ID'),
        solution: z.string().describe('Working solution'),
        verificationSteps: z.array(z.string()).optional().describe('How to verify the fix')
    }),
    z.object({
        action: z.literal('fail'),
        agentId: z.string().describe('Agent ID'),
        patternId: z.string().describe('Error pattern ID'),
        attemptedSolution: z.string().describe('What was tried')
    })
]);
export function agentErrorLearningTool(clients) {
    return {
        name: 'agent_error_learning',
        description: `Enable agents to learn from errors using a 2-strike protocol.

Usage Examples:
// Report a new error
agent_error_learning({
  action: "report",
  agentId: "backend-dev",
  errorSignature: "TypeError: Cannot read property 'x' of undefined",
  errorMessage: "Undefined property access in user service",
  contextSnapshot: "const name = user.profile.name; // user.profile is undefined",
  attemptedSolution: "Added optional chaining: user.profile?.name",
  projectContext: "api-service"
})

// Mark error as solved
agent_error_learning({
  action: "solve",
  agentId: "backend-dev",
  patternId: "err-pattern-123",
  solution: "Always check if user.profile exists before accessing properties",
  verificationSteps: [
    "Run: npm test user.service.spec.ts",
    "Verify no TypeErrors in logs",
    "Check user profile endpoint returns 200"
  ]
})

// Record failed attempt
agent_error_learning({
  action: "fail",
  agentId: "frontend-dev",
  patternId: "err-pattern-456",
  attemptedSolution: "Tried using default values but still crashed"
})

The 2-Strike Protocol:
1. First encounter: Agent gets the error signature to recognize it
2. Second encounter: Agent must solve it or face consequences
3. After 2 failures: Error importance increases, agent status may change

Response Types:
- first_occurrence: New error, pattern ID provided
- solution_found: Previous solution exists
- previous_attempts_failed: Shows attempt count (pressure!)
- new_problem: Similar to other errors but unique`,
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['report', 'solve', 'fail'],
                    description: 'Action to perform'
                },
                agentId: {
                    type: 'string',
                    description: 'Agent ID'
                },
                errorSignature: {
                    type: 'string',
                    description: 'Unique error identifier (for report)'
                },
                errorMessage: {
                    type: 'string',
                    description: 'Error message (for report)'
                },
                contextSnapshot: {
                    type: 'string',
                    description: 'Code/context where error occurred'
                },
                attemptedSolution: {
                    type: 'string',
                    description: 'What was tried'
                },
                projectContext: {
                    type: 'string',
                    description: 'Project name'
                },
                patternId: {
                    type: 'string',
                    description: 'Error pattern ID (for solve/fail)'
                },
                solution: {
                    type: 'string',
                    description: 'Working solution (for solve)'
                },
                verificationSteps: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'How to verify the fix'
                }
            },
            required: ['action', 'agentId']
        },
        handler: async (args) => {
            // Validate input
            const input = agentErrorLearningSchema.parse(args);
            try {
                if (input.action === 'report') {
                    // Report new error
                    const response = await clients.agent.handleErrorLearning({
                        agentId: input.agentId,
                        errorSignature: input.errorSignature,
                        errorMessage: input.errorMessage,
                        contextSnapshot: input.contextSnapshot,
                        attemptedSolution: input.attemptedSolution,
                        projectContext: input.projectContext
                    });
                    logger.info('Error reported', {
                        agentId: input.agentId,
                        responseType: response.type,
                        patternId: response.patternId
                    });
                    let responseText = '';
                    switch (response.type) {
                        case 'first_occurrence':
                            responseText = `🆕 First time seeing this error!\n`;
                            responseText += `Pattern ID: ${response.patternId}\n`;
                            responseText += `The agent will remember this error signature.`;
                            break;
                        case 'solution_found':
                            responseText = `✅ Solution found!\n`;
                            responseText += `Solution: ${response.solution}\n`;
                            if (response.verificationSteps?.length) {
                                responseText += `\nVerification steps:\n`;
                                response.verificationSteps.forEach((step, i) => {
                                    responseText += `${i + 1}. ${step}\n`;
                                });
                            }
                            break;
                        case 'previous_attempts_failed':
                            responseText = `⚠️ Previous attempts failed!\n`;
                            responseText += `Attempt #${response.previousAttempts}\n`;
                            if (response.previousAttempts && response.previousAttempts >= 2) {
                                responseText += `🚨 2-Strike limit reached! Agent status may be affected.`;
                            }
                            break;
                        case 'new_problem':
                            responseText = `🔍 New problem detected\n`;
                            if (response.similarPatternsCount) {
                                responseText += `Similar patterns found: ${response.similarPatternsCount}`;
                            }
                            break;
                    }
                    return [
                        {
                            type: 'text',
                            text: responseText
                        }
                    ];
                }
                else if (input.action === 'solve') {
                    // Save error solution
                    await clients.agent.saveErrorSolution({
                        agentId: input.agentId,
                        patternId: input.patternId,
                        solution: input.solution,
                        verificationSteps: input.verificationSteps
                    });
                    logger.info('Error solution saved', {
                        agentId: input.agentId,
                        patternId: input.patternId
                    });
                    return [
                        {
                            type: 'text',
                            text: `✅ Solution saved for pattern ${input.patternId}\nAgent ${input.agentId} has successfully resolved this error pattern!`
                        }
                    ];
                }
                else {
                    // Record failed attempt
                    await clients.agent.recordFailedAttempt(input.agentId, input.patternId, input.attemptedSolution);
                    logger.info('Failed attempt recorded', {
                        agentId: input.agentId,
                        patternId: input.patternId
                    });
                    return [
                        {
                            type: 'text',
                            text: `❌ Failed attempt recorded for pattern ${input.patternId}\nAgent ${input.agentId} needs to try a different approach.`
                        }
                    ];
                }
            }
            catch (error) {
                logger.error('Error learning operation failed', error);
                throw new Error(`Error learning operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };
}
//# sourceMappingURL=agent_error_learning.js.map