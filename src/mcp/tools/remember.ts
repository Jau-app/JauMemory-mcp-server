/**
 * Remember Tool - Simplified version for production
 */

import { z } from 'zod';
import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';

const rememberSchema = z.object({
  content: z.string().min(1).describe('The memory content to store'),
  context: z.string().optional().describe('Additional context for the memory'),
  importance: z.number().min(0).max(1).optional().describe('Importance score (0-1)'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  metadata: z.record(z.any()).optional().describe('Additional metadata (can include arrays / nested objects)'),
  shortcuts: z.array(z.string()).optional().describe('Quick-flag shortcuts like --bug, --high, --assign @x, --blocked <reason>. See get_guide({ topic: "concepts/shortcuts" }) for the full list.'),
});

export function rememberTool(clients: BackendClients): Tool {
  return {
    name: 'remember',
    description: 'Store a new memory with optional context and importance scoring',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The memory content to store'
        },
        context: {
          type: 'string',
          description: 'Additional context for the memory'
        },
        importance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Importance score (0-1)'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization'
        },
        metadata: {
          type: 'object',
          additionalProperties: true,
          description: 'Additional metadata (can include arrays / nested objects)'
        },
        shortcuts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Quick-flag shortcuts like "--bug", "--high", "--assign @coder-001", "--blocked waiting on contract". Parsed server-side into structured tags + metadata. Call get_guide({ topic: "concepts/shortcuts" }) for the full flag list and semantics.'
        }
      },
      required: ['content']
    },
    handler: async (args: unknown) => {
      const input = rememberSchema.parse(args);
      
      logger.info('Creating new memory', { 
        contentLength: input.content.length,
        hasTags: (input.tags?.length || 0) > 0
      });
      
      try {
        const userId = await clients.auth.getCurrentUserId();
        
        const memory = await clients.memory.createMemory({
          userId,
          content: input.content,
          context: input.context,
          importance: input.importance || 0.5,
          tags: input.tags || [],
          metadata: input.metadata || {},
          shortcuts: input.shortcuts
        });
        
        logger.info('Memory created successfully', { memoryId: memory.id });
        
        return [
          {
            type: 'text',
            text: `Memory stored successfully with ID: ${memory.id}`
          }
        ];
      } catch (error) {
        logger.error('Failed to create memory', error);
        throw new Error(`Failed to store memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };
}