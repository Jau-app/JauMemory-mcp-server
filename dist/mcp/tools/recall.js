import { z } from 'zod';
const recallSchema = z.object({
    query: z.string().describe('Search query'),
    limit: z.number().optional().describe('Maximum results')
});
export function recallTool(clients) {
    return {
        name: 'recall',
        description: 'Search and retrieve memories',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'number', description: 'Maximum results' }
            },
            required: ['query']
        },
        handler: async (args) => {
            const input = recallSchema.parse(args);
            const userId = await clients.auth.getCurrentUserId();
            const response = await clients.memory.recallMemories({
                userId,
                query: input.query,
                limit: input.limit || 10
            });
            return [{
                    type: 'text',
                    text: `Found ${response.results.length} memories:\n${response.results.map(r => `- ${r.memory.content}`).join('\n')}`
                }];
        }
    };
}
//# sourceMappingURL=recall.js.map