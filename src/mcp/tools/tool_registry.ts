/**
 * Tool Registry Tools
 *
 * MCP tools for registering, managing, and executing vendor-agnostic tools.
 * Tools are HTTP/API endpoints with automatic credential injection.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';
import { redactSecrets } from '../../utils/redaction.js';

export function toolCreateTool(clients: BackendClients): Tool {
  return {
    name: 'tool_create',
    description: 'Register a new tool in the tool registry. A tool wraps an HTTP API endpoint with optional credential injection, health monitoring, and schema validation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable name for the tool (e.g. "OpenAI Chat Completions")'
        },
        tool_type: {
          type: 'string',
          description: 'Type of tool: rest, graphql, grpc, webhook, script, cli, mcp, template, prompt, nomcp',
          enum: ['rest', 'graphql', 'grpc', 'webhook', 'script', 'cli', 'mcp', 'template', 'prompt', 'nomcp']
        },
        description: {
          type: 'string',
          description: 'Description of what the tool does'
        },
        base_url: {
          type: 'string',
          description: 'Base URL for the API (e.g. "https://api.openai.com/v1")'
        },
        endpoints_json: {
          type: 'string',
          description: 'JSON array of endpoint definitions: [{"path": "/chat/completions", "method": "POST", "description": "..."}]'
        },
        credential_id: {
          type: 'string',
          description: 'UUID of a vault credential to link for automatic auth injection'
        },
        category_id: {
          type: 'string',
          description: 'UUID of the category to assign this tool to'
        },
        health_check_url: {
          type: 'string',
          description: 'URL to ping for health checks'
        },
        is_public: {
          type: 'boolean',
          description: 'Whether this tool is visible to other users (default: false)'
        },
        input_schema_json: {
          type: 'string',
          description: 'JSON Schema for the tool input (optional)'
        },
        output_schema_json: {
          type: 'string',
          description: 'JSON Schema for the tool output (optional)'
        },
        hosting_provider: {
          type: 'string',
          description: 'Hosting provider: berrry, vercel, fly, railway, cloudflare, aws_lambda, self_hosted, external',
          enum: ['berrry', 'vercel', 'fly', 'railway', 'cloudflare', 'aws_lambda', 'self_hosted', 'external']
        },
        hosting_metadata_json: {
          type: 'string',
          description: 'JSON with provider-specific metadata. For Berrry: {"subdomain":"x","nomcp_credential_id":"uuid","auth_path":"user|agent","visibility":"public|private|unlisted"}'
        },
        rate_limit_json: {
          type: 'string',
          description: 'JSON rate limit config, e.g. {"requests_per_minute": 60, "requests_per_day": 1000}'
        },
        cost_per_call_json: {
          type: 'string',
          description: 'JSON cost config, e.g. {"amount": "0.01", "currency": "USD"}'
        },
        metadata_json: {
          type: 'string',
          description: 'Arbitrary JSON metadata for the tool'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization and search'
        }
      },
      required: ['name', 'tool_type']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const response = await clients.tools.createTool({
          name: args.name,
          tool_type: args.tool_type,
          description: args.description,
          base_url: args.base_url,
          endpoints_json: args.endpoints_json,
          credential_id: args.credential_id,
          category_id: args.category_id,
          hosting_provider: args.hosting_provider,
          hosting_metadata_json: args.hosting_metadata_json,
          health_check_url: args.health_check_url,
          is_public: args.is_public,
          input_schema_json: args.input_schema_json,
          output_schema_json: args.output_schema_json,
          rate_limit_json: args.rate_limit_json,
          cost_per_call_json: args.cost_per_call_json,
          metadata_json: args.metadata_json,
          tags: args.tags
        });

        return [
          {
            type: 'text',
            text: `Tool registered successfully!
ID: ${response.id}
Name: ${response.name}
Slug: ${response.slug}
Type: ${response.tool_type}
${response.base_url ? `Base URL: ${response.base_url}` : ''}
${response.has_credential ? `Credential Linked: Yes` : 'Credential Linked: No'}
${response.category_name ? `Category: ${response.category_name}` : ''}
Active: ${response.is_active ? 'Yes' : 'No'}`
          }
        ];
      } catch (error) {
        logger.error('Failed to create tool:', error);
        throw error;
      }
    }
  };
}

export function toolCallTool(clients: BackendClients): Tool {
  return {
    name: 'tool_call',
    description: 'Execute a registered tool by its slug. Credentials are automatically injected from the vault. Auth headers are set by the server -- callers must NOT include authorization headers in extra_headers.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Tool slug (e.g. "openai-chat-completions")'
        },
        endpoint_index: {
          type: 'number',
          description: 'Index of the endpoint to call (default: 0)'
        },
        method: {
          type: 'string',
          description: 'HTTP method override (uses endpoint default if omitted)',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
        },
        path_suffix: {
          type: 'string',
          description: 'Path suffix appended to base_url + endpoint path'
        },
        request_body: {
          type: 'string',
          description: 'Request body as a JSON string'
        },
        query_params: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Query parameters as key-value pairs'
        },
        extra_headers: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Extra HTTP headers. Auth headers are DENIED and will cause an error.'
        }
      },
      required: ['slug']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        logger.debug('tool_call invoked', { args: redactSecrets(args) });

        const response = await clients.tools.callTool({
          slug: args.slug,
          endpoint_index: args.endpoint_index,
          method: args.method,
          path_suffix: args.path_suffix,
          request_body: args.request_body,
          query_params: args.query_params,
          extra_headers: args.extra_headers
        });

        const statusEmoji = response.success ? 'OK' : 'FAILED';
        const sensitivityNote = response.used_credential
          ? '\n⚠️ Credential was used — response may contain sensitive data.'
          : '';

        // When a credential was injected, redact the response body to prevent
        // sensitive API responses from leaking through MCP output.
        const displayBody = response.used_credential
          ? '[REDACTED — credential-authenticated response]'
          : response.response_body;

        return [
          {
            type: 'text',
            text: `Tool Call Result [${statusEmoji}]
HTTP Status: ${response.http_status}
Response Time: ${response.response_time_ms}ms${sensitivityNote}
${response.error ? `Error: ${response.error}\n` : ''}
Response Body:
${displayBody}`
          }
        ];
      } catch (error) {
        logger.error('Failed to call tool:', error);
        throw error;
      }
    }
  };
}

export function toolListTool(clients: BackendClients): Tool {
  return {
    name: 'tool_list',
    description: 'List registered tools. Supports filtering by type, category, and full-text search.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_type: {
          type: 'string',
          description: 'Filter by tool type (rest, graphql, webhook, etc.)'
        },
        category_id: {
          type: 'string',
          description: 'Filter by category UUID'
        },
        active_only: {
          type: 'boolean',
          description: 'Only show active tools (default: false)'
        },
        include_public: {
          type: 'boolean',
          description: 'Include public tools from other users'
        },
        search: {
          type: 'string',
          description: 'Full-text search on name and description'
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

        const response = await clients.tools.listTools({
          tool_type: args.tool_type,
          category_id: args.category_id,
          active_only: args.active_only,
          include_public: args.include_public,
          search: args.search
        });

        if (!response.tools || response.tools.length === 0) {
          return [
            {
              type: 'text',
              text: 'No tools found. Register one with tool_create!'
            }
          ];
        }

        const lines = response.tools.map((t: any) =>
          `[${t.slug}] ${t.name} (${t.tool_type})${t.category_name ? ` | ${t.category_name}` : ''}
   ${t.description ? t.description.substring(0, 80) : 'No description'}
   Base URL: ${t.base_url || 'N/A'} | Credential: ${t.has_credential ? 'Yes' : 'No'} | Health: ${t.health_status} | Uses: ${t.usage_count}`
        ).join('\n\n');

        return [
          {
            type: 'text',
            text: `Registered Tools (${response.total} total):\n\n${lines}`
          }
        ];
      } catch (error) {
        logger.error('Failed to list tools:', error);
        throw error;
      }
    }
  };
}

export function toolRenderTool(clients: BackendClients): Tool {
  return {
    name: 'tool_render',
    description: 'Render a tool as a human-readable markdown document. Shows endpoints, schemas, and configuration -- credentials are redacted.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_id: {
          type: 'string',
          description: 'UUID of the tool to render'
        }
      },
      required: ['tool_id']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const response = await clients.tools.renderTool(args.tool_id);

        return [
          {
            type: 'text',
            text: response.markdown
          }
        ];
      } catch (error) {
        logger.error('Failed to render tool:', error);
        throw error;
      }
    }
  };
}

export function toolUpdateTool(clients: BackendClients): Tool {
  return {
    name: 'tool_update',
    description: 'Update an existing tool in the tool registry. All fields are optional — only provided fields are updated.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_id: {
          type: 'string',
          description: 'UUID of the tool to update'
        },
        name: {
          type: 'string',
          description: 'New name for the tool'
        },
        tool_type: {
          type: 'string',
          description: 'Type of tool: rest, graphql, grpc, webhook, script, cli, mcp, template, prompt, nomcp',
          enum: ['rest', 'graphql', 'grpc', 'webhook', 'script', 'cli', 'mcp', 'template', 'prompt', 'nomcp']
        },
        description: {
          type: 'string',
          description: 'New description'
        },
        base_url: {
          type: 'string',
          description: 'New base URL'
        },
        endpoints_json: {
          type: 'string',
          description: 'JSON array of endpoint definitions'
        },
        category_id: {
          type: 'string',
          description: 'UUID of the category'
        },
        hosting_provider: {
          type: 'string',
          description: 'Hosting provider: berrry, vercel, fly, railway, cloudflare, aws_lambda, self_hosted, external',
          enum: ['berrry', 'vercel', 'fly', 'railway', 'cloudflare', 'aws_lambda', 'self_hosted', 'external']
        },
        hosting_metadata_json: {
          type: 'string',
          description: 'JSON with provider-specific metadata. For Berrry: {"subdomain":"x","nomcp_credential_id":"uuid","auth_path":"user|agent","visibility":"public|private|unlisted"}'
        },
        health_check_url: {
          type: 'string',
          description: 'URL for health checks'
        },
        is_public: {
          type: 'boolean',
          description: 'Whether tool is publicly visible'
        },
        is_active: {
          type: 'boolean',
          description: 'Whether tool is active and callable'
        },
        input_schema_json: {
          type: 'string',
          description: 'JSON Schema for tool input'
        },
        output_schema_json: {
          type: 'string',
          description: 'JSON Schema for tool output'
        },
        rate_limit_json: {
          type: 'string',
          description: 'JSON rate limit config, e.g. {"requests_per_minute": 60, "requests_per_day": 1000}'
        },
        cost_per_call_json: {
          type: 'string',
          description: 'JSON cost config, e.g. {"amount": "0.01", "currency": "USD"}'
        },
        metadata_json: {
          type: 'string',
          description: 'Arbitrary JSON metadata for the tool'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization'
        }
      },
      required: ['tool_id']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const response = await clients.tools.updateTool({
          tool_id: args.tool_id,
          name: args.name,
          tool_type: args.tool_type,
          description: args.description,
          base_url: args.base_url,
          endpoints_json: args.endpoints_json,
          category_id: args.category_id,
          hosting_provider: args.hosting_provider,
          hosting_metadata_json: args.hosting_metadata_json,
          health_check_url: args.health_check_url,
          is_public: args.is_public,
          is_active: args.is_active,
          input_schema_json: args.input_schema_json,
          output_schema_json: args.output_schema_json,
          rate_limit_json: args.rate_limit_json,
          cost_per_call_json: args.cost_per_call_json,
          metadata_json: args.metadata_json,
          tags: args.tags
        });

        return [
          {
            type: 'text',
            text: `Tool updated successfully!
ID: ${response.id}
Name: ${response.name}
Slug: ${response.slug}
Type: ${response.tool_type}
${response.base_url ? `Base URL: ${response.base_url}` : ''}
Active: ${response.is_active ? 'Yes' : 'No'}`
          }
        ];
      } catch (error) {
        logger.error('Failed to update tool:', error);
        throw error;
      }
    }
  };
}
