import { z } from 'zod';
const updateSchema = z.object({
    memoryId: z.string().describe('Memory ID to update'),
    content: z.string().optional(),
    importance: z.number().optional()
});
export function updateTool(clients) {
    return {
        name: 'update',
        description: 'Update an existing memory',
        inputSchema: {
            type: 'object',
            properties: {
                memoryId: { type: 'string', description: 'Memory ID to update' },
                content: { type: 'string', description: 'New content' },
                importance: { type: 'number', description: 'New importance' }
            },
            required: ['memoryId']
        },
        handler: async (args) => {
            const input = updateSchema.parse(args);
            const userId = await clients.auth.getCurrentUserId();
            await clients.memory.updateMemory(input.memoryId, userId, {
                content: input.content,
                importance: input.importance
            });
            return [{
                    type: 'text',
                    text: `Memory ${input.memoryId} updated successfully`
                }];
        }
    };
}
//# sourceMappingURL=update.js.map