/**
 * Memory Statistics Tool
 *
 * Get statistics about memories with optional filtering
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
// Input validation schema
const memoryStatsSchema = z.object({
    query: z.string().optional().describe('Search query (supports wildcards with *)'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
    minImportance: z.number().min(0).max(1).optional().describe('Minimum importance threshold'),
    timeRange: z.object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)')
    }).optional().describe('Time range for filtering')
});
export function memoryStatsTool(clients) {
    return {
        name: 'memory_stats',
        description: `Get statistics about memories with optional filtering.

Usage Examples:
// Get overall stats
memory_stats()

// Stats for memories containing "error"
memory_stats({ query: "error" })

// Stats for last week
memory_stats({ 
  timeRange: { 
    start: "2025-01-17", 
    end: "2025-01-24" 
  } 
})

// Stats for React-related errors
memory_stats({ 
  query: "react error*",
  minImportance: 0.5 
})

// Stats for specific tags
memory_stats({ 
  tags: ["bug", "frontend"] 
})

Returns:
- Total memory count (filtered)
- Memory type distribution
- Top 20 tags with counts
- Importance distribution
- Keyword frequency (if applicable)`,
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query (supports wildcards with *)'
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter by tags'
                },
                minImportance: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: 'Minimum importance threshold'
                },
                timeRange: {
                    type: 'object',
                    properties: {
                        start: {
                            type: 'string',
                            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                            description: 'Start date (YYYY-MM-DD)'
                        },
                        end: {
                            type: 'string',
                            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                            description: 'End date (YYYY-MM-DD)'
                        }
                    }
                }
            }
        },
        handler: async (args) => {
            // Validate input
            const input = memoryStatsSchema.parse(args || {});
            try {
                // Call gRPC method through pattern client
                const stats = await clients.pattern.getMemoryStats({
                    query: input.query,
                    tags: input.tags || [],
                    minImportance: input.minImportance,
                    startDate: input.timeRange?.start,
                    endDate: input.timeRange?.end
                });
                // Format the response
                let text = `📊 Memory Statistics\n\n`;
                text += `Total Memories: ${stats.totalCount}\n`;
                if (stats.memoriesByType && Object.keys(stats.memoriesByType).length > 0) {
                    text += `\n📁 Memory Types:\n`;
                    for (const [type, count] of Object.entries(stats.memoriesByType)) {
                        text += `  • ${type}: ${count}\n`;
                    }
                }
                if (stats.topTags && stats.topTags.length > 0) {
                    text += `\n🏷️ Top Tags:\n`;
                    stats.topTags.slice(0, 10).forEach((tag) => {
                        text += `  • ${tag.tag}: ${tag.count}\n`;
                    });
                }
                if (stats.memoriesByImportance && Object.keys(stats.memoriesByImportance).length > 0) {
                    text += `\n⭐ Importance Distribution:\n`;
                    for (const [importance, count] of Object.entries(stats.memoriesByImportance)) {
                        const stars = '★'.repeat(Math.round(parseFloat(importance) * 5));
                        text += `  • ${importance}: ${count} ${stars}\n`;
                    }
                }
                if (stats.keywordFrequency && stats.keywordFrequency.length > 0) {
                    text += `\n🔤 Top Keywords:\n`;
                    stats.keywordFrequency.slice(0, 10).forEach((kw) => {
                        text += `  • ${kw.keyword}: ${kw.frequency}\n`;
                    });
                }
                logger.info('Memory stats retrieved', {
                    total: stats.totalCount,
                    filters: input
                });
                return [
                    {
                        type: 'text',
                        text
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to get memory stats', error);
                throw new Error(`Failed to get memory stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };
}
//# sourceMappingURL=memory_stats.js.map