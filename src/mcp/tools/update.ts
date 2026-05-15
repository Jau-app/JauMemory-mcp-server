import { z } from 'zod';
import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';

const updateSchema = z.object({
  memoryId: z.string().describe('Memory ID to update'),
  content: z.string().optional().describe('New content (replaces existing)'),
  context: z.string().optional().describe('New context (replaces existing)'),
  importance: z.number().min(0).max(1).optional().describe('New importance (0-1)'),
  tags: z.array(z.string()).optional().describe('Tags to ADD to the memory. Strictly additive in v1 — unioned with existing tags. Cannot remove a tag through this field; that is v2 territory.'),
  metadata: z.record(z.any()).optional().describe('Explicit metadata patch. Deep-merges into existing metadata LAST (after shortcuts), so e.g. { "assigned_to": [] } clears an existing assignment array.'),
  shortcuts: z.array(z.string()).optional().describe('Quick-flag shortcuts (additive — no shortcut ever clears existing values; use the explicit metadata field for that). See get_guide({ topic: "concepts/shortcuts" }).'),
});

export function updateTool(clients: BackendClients): Tool {
  return {
    name: 'update',
    description: 'Update an existing memory. Accepts the same shape as remember (content / context / importance / tags / metadata / shortcuts), but every field is optional and unset fields are left untouched. Update semantics in v1: tags + shortcuts are strictly ADDITIVE (unioned with existing); explicit `metadata` deep-merges LAST so callers can clear shortcut-set fields like `assigned_to: []`. To remove a tag, store the new tag set in metadata or delete + recreate the memory (v2 will add a dedicated replace operation).',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: {
          type: 'string',
          description: 'Memory ID to update'
        },
        content: {
          type: 'string',
          description: 'New content (replaces existing)'
        },
        context: {
          type: 'string',
          description: 'New context (replaces existing)'
        },
        importance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'New importance (0-1)'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to ADD to the memory. Strictly additive in v1 — unioned with existing. Cannot remove a tag through this field.'
        },
        metadata: {
          type: 'object',
          additionalProperties: true,
          description: 'Explicit metadata patch. Deep-merges into existing metadata LAST (after shortcuts), so e.g. { "assigned_to": [] } clears an existing assignment array.'
        },
        shortcuts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Quick-flag shortcuts (additive). Call get_guide({ topic: "concepts/shortcuts" }) for the full flag list and semantics.'
        }
      },
      required: ['memoryId']
    },
    handler: async (args: unknown) => {
      const input = updateSchema.parse(args);
      const userId = await clients.auth.getCurrentUserId();

      await clients.memory.updateMemory(input.memoryId, userId, {
        content: input.content,
        context: input.context,
        importance: input.importance,
        tags: input.tags,
        metadata: input.metadata,
        shortcuts: input.shortcuts
      });

      return [{
        type: 'text',
        text: `Memory ${input.memoryId} updated successfully`
      }];
    }
  };
}
