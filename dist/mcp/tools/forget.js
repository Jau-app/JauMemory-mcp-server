import { z } from 'zod';
const forgetSchema = z.object({
    memoryId: z.string().describe('Memory ID to delete')
});
export function forgetTool(clients) {
    return {
        name: 'forget',
        description: 'Delete a specific memory',
        inputSchema: {
            type: 'object',
            properties: {
                memoryId: { type: 'string', description: 'Memory ID to delete' }
            },
            required: ['memoryId']
        },
        handler: async (args) => {
            const input = forgetSchema.parse(args);
            const userId = await clients.auth.getCurrentUserId();
            await clients.memory.deleteMemory(input.memoryId, userId);
            return [{
                    type: 'text',
                    text: `Memory ${input.memoryId} deleted successfully`
                }];
        }
    };
}
//# sourceMappingURL=forget.js.map