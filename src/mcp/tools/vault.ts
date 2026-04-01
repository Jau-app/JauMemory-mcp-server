/**
 * Credential Vault Tools
 *
 * MCP tools for securely storing and managing API credentials.
 * IMPORTANT: Plaintext credential values are NEVER included in tool responses.
 * Only masked_value (e.g. "sk-...xyz1") is ever returned.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';
import { redactSecrets } from '../../utils/redaction.js';

export function vaultStoreTool(clients: BackendClients): Tool {
  return {
    name: 'vault_store',
    description: 'Store a new API credential in the secure vault. The secret value is encrypted at rest and never returned in responses. Use provider presets (e.g. "openai", "stripe") to auto-configure auth headers.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable name for this credential (e.g. "OpenAI Production Key")'
        },
        credential_type: {
          type: 'string',
          description: 'Type of credential: api_key, bearer_token, basic_auth, oauth2, custom_header',
          enum: ['api_key', 'bearer_token', 'basic_auth', 'oauth2', 'custom_header']
        },
        value: {
          type: 'string',
          description: 'The secret value (API key, token, etc.). Write-only: never returned in responses.'
        },
        provider: {
          type: 'string',
          description: 'Provider name (e.g. "openai", "stripe", "github"). Auto-configures auth headers if a preset exists.'
        },
        description: {
          type: 'string',
          description: 'Optional description of what this credential is used for'
        },
        auth_header: {
          type: 'string',
          description: 'HTTP header name for injection (default: "Authorization")'
        },
        auth_prefix: {
          type: 'string',
          description: 'Value prefix (e.g. "Bearer", "Basic", "Token")'
        },
        injection_method: {
          type: 'string',
          description: 'How to inject: header, query, body, url',
          enum: ['header', 'query', 'body', 'url']
        },
        scopes: {
          type: 'array',
          items: { type: 'string' },
          description: 'OAuth scopes or permission labels for this credential'
        },
        notes: {
          type: 'string',
          description: 'Private notes about this credential'
        }
      },
      required: ['name', 'credential_type', 'value']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        logger.debug('vault_store called', { args: redactSecrets(args) });

        const response = await clients.credentials.storeCredential({
          name: args.name,
          credential_type: args.credential_type,
          value: args.value,
          provider: args.provider,
          description: args.description,
          auth_header: args.auth_header,
          auth_prefix: args.auth_prefix,
          injection_method: args.injection_method,
          scopes: args.scopes,
          notes: args.notes
        });

        return [
          {
            type: 'text',
            text: `Credential stored securely!
ID: ${response.id}
Name: ${response.name}
Slug: ${response.slug}
Type: ${response.credential_type}
${response.provider ? `Provider: ${response.provider}` : ''}
Masked Value: ${response.masked_value}
Injection: ${response.injection_method} via ${response.auth_header}${response.auth_prefix ? ` (prefix: ${response.auth_prefix})` : ''}`
          }
        ];
      } catch (error) {
        logger.error('Failed to store credential:', error);
        throw error;
      }
    }
  };
}

export function vaultListTool(clients: BackendClients): Tool {
  return {
    name: 'vault_list',
    description: 'List your stored credentials. Values are always masked (e.g. "sk-...xyz1"). Supports filtering by provider and type.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'Filter by provider (e.g. "openai", "stripe")'
        },
        credential_type: {
          type: 'string',
          description: 'Filter by type: api_key, bearer_token, basic_auth, oauth2, custom_header'
        },
        active_only: {
          type: 'boolean',
          description: 'Only show active credentials (default: false)'
        }
      },
      required: []
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const response = await clients.credentials.listCredentials({
          provider: args.provider,
          credential_type: args.credential_type,
          active_only: args.active_only
        });

        if (!response.credentials || response.credentials.length === 0) {
          return [
            {
              type: 'text',
              text: 'No credentials found. Store one with vault_store!'
            }
          ];
        }

        const lines = response.credentials.map((c: any) =>
          `[${c.id}] ${c.name} (${c.credential_type})${c.provider ? ` - ${c.provider}` : ''}
   Masked: ${c.masked_value} | Active: ${c.is_active ? 'Yes' : 'No'}${c.last_used_at ? ` | Last used: ${new Date(c.last_used_at).toLocaleDateString()}` : ''}`
        ).join('\n\n');

        return [
          {
            type: 'text',
            text: `Your Credentials (${response.total} total):\n\n${lines}`
          }
        ];
      } catch (error) {
        logger.error('Failed to list credentials:', error);
        throw error;
      }
    }
  };
}

export function vaultRotateTool(clients: BackendClients): Tool {
  return {
    name: 'vault_rotate',
    description: 'Rotate (replace) the secret value of an existing credential. The old value is permanently replaced. The new value is write-only and never returned.',
    inputSchema: {
      type: 'object',
      properties: {
        credential_id: {
          type: 'string',
          description: 'UUID of the credential to rotate'
        },
        new_value: {
          type: 'string',
          description: 'The new secret value. Write-only: never returned in responses.'
        }
      },
      required: ['credential_id', 'new_value']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        logger.debug('vault_rotate called', { args: redactSecrets(args) });

        const response = await clients.credentials.rotateCredential({
          credential_id: args.credential_id,
          new_value: args.new_value
        });

        return [
          {
            type: 'text',
            text: `Credential rotated successfully!
ID: ${response.id}
Name: ${response.name}
New Masked Value: ${response.masked_value}
Rotated At: ${response.last_rotated_at ? new Date(response.last_rotated_at).toLocaleString() : 'now'}`
          }
        ];
      } catch (error) {
        logger.error('Failed to rotate credential:', error);
        throw error;
      }
    }
  };
}
