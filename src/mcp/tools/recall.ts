import { z } from 'zod';
import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';

const recallSchema = z.object({
  query: z.string().optional().describe('Search query. Omit for filters-only search.'),
  mode: z.enum(['keyword', 'semantic', 'hybrid']).optional()
    .describe('Search mode. Defaults to hybrid.'),
  tags: z.array(z.string()).optional()
    .describe('Filter results to memories with ANY of these tags.'),
  timeRange: z.object({
    start: z.string().optional().describe('ISO date or YYYY-MM-DD'),
    end: z.string().optional().describe('ISO date or YYYY-MM-DD')
  }).optional().describe('Filter to memories created within this range.'),
  minImportance: z.number().min(0).max(1).optional()
    .describe('Lower bound on memory importance (0.0-1.0).'),
  limit: z.number().optional().describe('Maximum results (default 10)')
});

export function recallTool(clients: BackendClients): Tool {
  return {
    name: 'recall',
    description:
      'Search and retrieve memories. Supports keyword/semantic/hybrid modes, tag/time/importance filters. Query is optional for filters-only searches.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (optional — omit for filters-only).'
        },
        mode: {
          type: 'string',
          enum: ['keyword', 'semantic', 'hybrid'],
          description: 'Search mode. Defaults to hybrid on the backend.'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to memories with ANY of these tags.'
        },
        timeRange: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start (ISO / YYYY-MM-DD)' },
            end: { type: 'string', description: 'End (ISO / YYYY-MM-DD)' }
          },
          description: 'Filter to memories created within this range.'
        },
        minImportance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Lower bound on memory importance (0.0-1.0).'
        },
        limit: { type: 'number', description: 'Maximum results (default 10)' }
      }
      // query is intentionally NOT required — filters-only search is legal.
    },
    handler: async (args: unknown) => {
      const input = recallSchema.parse(args);
      const userId = await clients.auth.getCurrentUserId();

      const response = await clients.memory.recallMemories({
        userId,
        query: input.query,
        mode: input.mode,
        tags: input.tags,
        timeRange: input.timeRange,
        minImportance: input.minImportance,
        limit: input.limit || 10
      });

      return [{
        type: 'text',
        text: `Found ${response.results.length} memories:\n${response.results.map(r =>
          `- ${r.memory.content}`
        ).join('\n')}`
      }];
    }
  };
}
