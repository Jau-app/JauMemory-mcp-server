/**
 * Berrry Convenience Tools
 *
 * High-level MCP tools for registering and creating Berrry apps as JauMemory tools.
 * Uses the NOMCP dispatch path (Phase 1) for app verification and creation.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';

/**
 * Attempt to delete a tool, returning a cleanup message on failure.
 * Used by both register and create tools for rollback.
 */
async function tryDeleteTool(
  clients: BackendClients,
  toolId: string
): Promise<{ deleted: boolean; message: string }> {
  try {
    await clients.tools.deleteTool(toolId);
    return { deleted: true, message: '' };
  } catch (deleteErr: any) {
    const msg = `Orphan tool ${toolId} could not be cleaned up — delete it from the Tools page in the web UI or via the REST API: DELETE /v1/tools/${toolId}.`;
    logger.error('Failed to clean up orphan tool:', deleteErr);
    return { deleted: false, message: msg };
  }
}

export function berrryRegisterToolTool(clients: BackendClients): Tool {
  return {
    name: 'berrry_register_tool',
    description: 'Register an existing Berrry app as a JauMemory tool. Verifies the app exists via NOMCP before finalizing. Requires a vault credential with your Berrry NOMCP token (store one first with vault_store).',
    inputSchema: {
      type: 'object',
      properties: {
        subdomain: {
          type: 'string',
          description: 'Berrry app subdomain (e.g. "json-validator" for json-validator.berrry.app)'
        },
        nomcp_credential_id: {
          type: 'string',
          description: 'UUID of the vault credential containing your Berrry NOMCP token'
        },
        name: {
          type: 'string',
          description: 'Display name for the tool (defaults to subdomain)'
        },
        description: {
          type: 'string',
          description: 'Description of what the tool does'
        },
        auth_path: {
          type: 'string',
          description: 'Authentication path: "user" (API key, no expiry) or "agent" (Ed25519, 24h expiry). Default: "user"',
          enum: ['user', 'agent']
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization and search'
        }
      },
      required: ['subdomain', 'nomcp_credential_id']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const subdomain: string = args.subdomain;
        const nomcpCredentialId: string = args.nomcp_credential_id;
        const authPath: string = args.auth_path || 'user';
        const toolName: string = args.name || subdomain;
        const description: string = args.description || `Berrry app: ${subdomain}.berrry.app`;

        // Step 1: Create tool entry with NOMCP metadata
        const hostingMetadata = JSON.stringify({
          subdomain,
          nomcp_credential_id: nomcpCredentialId,
          auth_path: authPath,
          visibility: 'public'
        });

        const tool = await clients.tools.createTool({
          name: toolName,
          tool_type: 'nomcp',
          description,
          base_url: `https://${subdomain}.berrry.app`,
          hosting_provider: 'berrry',
          hosting_metadata_json: hostingMetadata,
          tags: args.tags || ['berrry']
        });

        const toolId: string = tool.id;
        const toolSlug: string = tool.slug;

        // Step 2: Verify app exists via NOMCP dispatch
        let verifyResponse;
        try {
          verifyResponse = await clients.tools.callTool({
            slug: toolSlug,
            method: 'GET',
            path_suffix: `__nomcp/apps/${subdomain}/files`
          });
        } catch (callErr: any) {
          // Network/gRPC error during verification
          const cleanup = await tryDeleteTool(clients, toolId);
          if (cleanup.deleted) {
            throw new Error(`Failed to verify app '${subdomain}' on Berrry: ${callErr.message}. No tool was registered.`);
          } else {
            throw new Error(`Failed to verify app '${subdomain}': ${callErr.message}. ${cleanup.message}`);
          }
        }

        // Step 3: Check verification result
        if (!verifyResponse.success) {
          const cleanup = await tryDeleteTool(clients, toolId);
          const status = verifyResponse.http_status;

          let reason: string;
          if (status === 404) {
            reason = `App '${subdomain}' not found on Berrry.`;
          } else if (status === 401 || status === 403) {
            reason = `NOMCP token rejected (HTTP ${status}). Check that nomcp_credential_id contains a valid Berrry token.`;
          } else {
            reason = `Verification failed (HTTP ${status}${verifyResponse.error ? ': ' + verifyResponse.error : ''}).`;
          }

          if (cleanup.deleted) {
            throw new Error(`${reason} No tool was registered.`);
          } else {
            throw new Error(`${reason} ${cleanup.message}`);
          }
        }

        // Step 4: Parse file list for API discovery hints
        let fileHint = '';
        try {
          const body = JSON.parse(verifyResponse.response_body);
          const files: string[] = Array.isArray(body)
            ? body.map((f: any) => typeof f === 'string' ? f : f.name).filter(Boolean)
            : (body.files || []).map((f: any) => typeof f === 'string' ? f : f.name).filter(Boolean);
          if (files.length > 0) {
            fileHint = `\nApp files: ${files.join(', ')}`;
          }
        } catch {
          // Non-JSON or unexpected shape — not critical
        }

        return [
          {
            type: 'text',
            text: `Berrry app registered as tool!
Tool ID: ${toolId}
Tool Slug: ${toolSlug}
Name: ${toolName}
App URL: https://${subdomain}.berrry.app
Auth Path: ${authPath}${fileHint}

Use tool_call with slug "${toolSlug}" to call the app's HTTP API.
Use tool_call with path_suffix "__nomcp/..." to manage the app via NOMCP.`
          }
        ];
      } catch (error) {
        logger.error('berrry_register_tool failed:', error);
        throw error;
      }
    }
  };
}

export function berrryCreateToolTool(clients: BackendClients): Tool {
  return {
    name: 'berrry_create_tool',
    description: 'Create a new Berrry app AND register it as a JauMemory tool in one step. Provide app files or remix from an existing app. Requires a vault credential with your Berrry NOMCP token.',
    inputSchema: {
      type: 'object',
      properties: {
        subdomain: {
          type: 'string',
          description: 'Subdomain for the new app (e.g. "data-cleaner" for data-cleaner.berrry.app)'
        },
        nomcp_credential_id: {
          type: 'string',
          description: 'UUID of the vault credential containing your Berrry NOMCP token'
        },
        files_json: {
          type: 'string',
          description: 'JSON array of files: [{"name":"index.html","content":"..."},{"name":"api.js","content":"..."}]'
        },
        remix_from: {
          type: 'string',
          description: 'Subdomain of an existing app to remix/fork instead of providing files'
        },
        name: {
          type: 'string',
          description: 'Display name for the tool (defaults to subdomain)'
        },
        description: {
          type: 'string',
          description: 'Description of what the app/tool does'
        },
        auth_path: {
          type: 'string',
          description: 'Authentication path: "user" (API key) or "agent" (Ed25519). Default: "user"',
          enum: ['user', 'agent']
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization and search'
        }
      },
      required: ['subdomain', 'nomcp_credential_id']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const subdomain: string = args.subdomain;
        const nomcpCredentialId: string = args.nomcp_credential_id;
        const authPath: string = args.auth_path || 'user';
        const toolName: string = args.name || subdomain;
        const description: string = args.description || `Berrry app: ${subdomain}.berrry.app`;

        if (!args.files_json && !args.remix_from) {
          throw new Error('Either files_json or remix_from is required to create a Berrry app.');
        }
        if (args.files_json && args.remix_from) {
          throw new Error('Provide files_json or remix_from, not both.');
        }

        // Parse files_json BEFORE creating tool to avoid orphan on bad JSON
        let createBody: any;
        if (args.remix_from) {
          createBody = { remix_from: args.remix_from, subdomain };
        } else {
          let parsedFiles: any;
          try {
            parsedFiles = JSON.parse(args.files_json);
          } catch (parseErr: any) {
            throw new Error(`Invalid files_json: ${parseErr.message}`);
          }
          if (!Array.isArray(parsedFiles) || parsedFiles.length === 0) {
            throw new Error('files_json must be a non-empty JSON array of file objects.');
          }
          createBody = { subdomain, files: parsedFiles };
        }

        // Step 1: Register tool entry (backend validates metadata)
        const hostingMetadata = JSON.stringify({
          subdomain,
          nomcp_credential_id: nomcpCredentialId,
          auth_path: authPath,
          visibility: 'public'
        });

        const tool = await clients.tools.createTool({
          name: toolName,
          tool_type: 'nomcp',
          description,
          base_url: `https://${subdomain}.berrry.app`,
          hosting_provider: 'berrry',
          hosting_metadata_json: hostingMetadata,
          tags: args.tags || ['berrry']
        });

        const toolId: string = tool.id;
        const toolSlug: string = tool.slug;

        let createResponse;
        try {
          createResponse = await clients.tools.callTool({
            slug: toolSlug,
            method: 'POST',
            path_suffix: '__nomcp/apps',
            request_body: JSON.stringify(createBody)
          });
        } catch (callErr: any) {
          const cleanup = await tryDeleteTool(clients, toolId);
          if (cleanup.deleted) {
            throw new Error(`Failed to create app '${subdomain}' on Berrry: ${callErr.message}. No tool was registered.`);
          } else {
            throw new Error(`Failed to create app '${subdomain}': ${callErr.message}. ${cleanup.message}`);
          }
        }

        // Step 3: Check creation result
        if (!createResponse.success) {
          const cleanup = await tryDeleteTool(clients, toolId);
          const detail = createResponse.error || `HTTP ${createResponse.http_status}`;

          // Parse common Berrry error patterns
          let friendlyMsg = `Berrry app creation failed: ${detail}`;
          if (createResponse.http_status === 409) {
            friendlyMsg = `Subdomain '${subdomain}' is already taken on Berrry.`;
          } else if (createResponse.http_status === 401 || createResponse.http_status === 403) {
            friendlyMsg = `NOMCP token rejected (HTTP ${createResponse.http_status}). Check that nomcp_credential_id contains a valid Berrry token.`;
          } else if (createResponse.http_status === 400) {
            friendlyMsg = `Invalid app payload: ${detail}`;
          }

          if (cleanup.deleted) {
            throw new Error(`${friendlyMsg} No tool was registered.`);
          } else {
            throw new Error(`${friendlyMsg} ${cleanup.message}`);
          }
        }

        // Step 4: Parse creation response for app details
        let appUrl = `https://${subdomain}.berrry.app`;
        try {
          const body = JSON.parse(createResponse.response_body);
          if (body.url) appUrl = body.url;
        } catch {
          // Use default URL
        }

        return [
          {
            type: 'text',
            text: `Berrry app created and registered as tool!
Tool ID: ${toolId}
Tool Slug: ${toolSlug}
Name: ${toolName}
App URL: ${appUrl}
Auth Path: ${authPath}
${args.remix_from ? `Remixed from: ${args.remix_from}` : `Files: ${createBody.files.length} file(s)`}

Use tool_call with slug "${toolSlug}" to call the app's HTTP API.
Use tool_call with path_suffix "__nomcp/..." to manage the app via NOMCP.
Combine with skill_create to build multi-step pipelines.`
          }
        ];
      } catch (error) {
        logger.error('berrry_create_tool failed:', error);
        throw error;
      }
    }
  };
}
