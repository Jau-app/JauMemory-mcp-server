/**
 * General Memory Consolidation Tool
 *
 * Consolidates similar memories into insights using semantic similarity.
 * This creates consolidated memories with the 'consolidated' tag (not collection-specific).
 */
import { logger } from '../../utils/logger.js';
export function consolidateTool(clients) {
    return {
        name: 'consolidate',
        description: 'Consolidate similar memories into insights based on semantic similarity',
        inputSchema: {
            type: 'object',
            properties: {
                similarity_threshold: {
                    type: 'number',
                    description: 'Minimum similarity score to group memories (0.0-1.0, default: 0.7)',
                    minimum: 0,
                    maximum: 1,
                    default: 0.7
                },
                min_group_size: {
                    type: 'number',
                    description: 'Minimum number of memories to form a group (default: 2)',
                    minimum: 2,
                    default: 2
                },
                archive_originals: {
                    type: 'boolean',
                    description: 'Archive original memories after consolidation (default: true)',
                    default: true
                },
                dry_run: {
                    type: 'boolean',
                    description: 'Preview consolidation without making changes (default: false)',
                    default: false
                }
            }
        },
        handler: async (args) => {
            try {
                // Check authentication
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                // Use the consolidation gRPC client
                const result = await clients.consolidation.consolidateMemories({
                    strategy: {
                        similarity_threshold: args.similarity_threshold || 0.7,
                        min_group_size: args.min_group_size || 2,
                        archive_originals: args.archive_originals !== false
                    },
                    dry_run: args.dry_run || false
                });
                // Format response
                let responseText = args.dry_run ?
                    '=== DRY RUN - No changes made ===\n\n' :
                    '=== Consolidation Complete ===\n\n';
                responseText += `Memories affected: ${result.memories_affected || 0}\n`;
                responseText += `Consolidations performed: ${result.consolidations_performed?.length || 0}\n`;
                if (result.insights_generated && result.insights_generated.length > 0) {
                    responseText += `\nInsights generated: ${result.insights_generated.length}\n`;
                    result.insights_generated.forEach((insight, i) => {
                        responseText += `\n${i + 1}. ${insight.content || insight.description}\n`;
                        if (insight.importance) {
                            responseText += `   Importance: ${(insight.importance * 100).toFixed(0)}%\n`;
                        }
                    });
                }
                if (result.space_saved && result.space_saved > 0) {
                    responseText += `\nSpace saved: ${result.space_saved} bytes\n`;
                }
                if (result.consolidations_performed && result.consolidations_performed.length > 0) {
                    responseText += '\n=== Consolidation Details ===\n';
                    result.consolidations_performed.forEach((consolidation, i) => {
                        responseText += `\n${i + 1}. Consolidated ${consolidation.memory_count || 2} memories\n`;
                        if (consolidation.new_memory_id) {
                            responseText += `   New memory ID: ${consolidation.new_memory_id}\n`;
                        }
                        if (consolidation.similarity_score) {
                            responseText += `   Similarity: ${(consolidation.similarity_score * 100).toFixed(0)}%\n`;
                        }
                    });
                }
                return [{
                        type: 'text',
                        text: responseText
                    }];
            }
            catch (error) {
                logger.error('Failed to consolidate memories:', error);
                if (error instanceof Error) {
                    throw new Error(`Consolidation failed: ${error.message}`);
                }
                throw error;
            }
        }
    };
}
//# sourceMappingURL=consolidate.js.map