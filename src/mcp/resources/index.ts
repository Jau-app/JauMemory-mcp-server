/**
 * MCP Resources
 */

import type { BackendClients } from '../../types/clients.js';

export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: () => Promise<any>;
}

export function setupResources(clients: BackendClients): Record<string, Resource> {
  return {
    status: {
      uri: 'jaumemory://status',
      name: 'System Status',
      description: 'Current system status and configuration',
      mimeType: 'application/json',
      handler: async () => {
        const userId = await clients.auth.getCurrentUserId();
        return {
          status: 'connected',
          userId,
          service: 'JauMemory Production',
          version: '1.0.0'
        };
      }
    }
  };
}