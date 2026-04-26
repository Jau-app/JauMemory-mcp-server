/**
 * MCP Authenticate Tool
 *
 * Completes the authentication flow with the auth token from web approval
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';

export function authenticateTool(clients: BackendClients): Tool {
  return {
    name: 'mcp_authenticate',
    description: 'Complete MCP authentication with the auth token you received from the web approval page. You MUST have clicked the link, approved in your browser, and copied the authentication code.',
    inputSchema: {
      type: 'object',
      properties: {
        auth_token: {
          type: 'string',
          description: 'The EXACT authentication code shown on the approval webpage after clicking Approve (e.g., "happy-star")'
        },
        request_id: {
          type: 'string',
          description: 'The request ID from mcp_login response (required)'
        }
      },
      required: ['auth_token']
    },
    handler: async (args: any) => {
      try {
        const { auth_token } = args;
        let { request_id } = args;

        // request_id is required
        if (!request_id) {
          throw new Error('request_id is required. Please provide the request_id from the mcp_login response (it was shown after you ran mcp_login).');
        }

        logger.info('Completing MCP authentication...', { request_id });

        // Use the auth manager from clients
        const authManager = clients.auth.authManager;
        await authManager.completeAuthentication(request_id, auth_token);

        // Get the user ID from auth manager
        const userId = await authManager.getUserId();

        // Plan A3: do NOT echo `auth_token` (or `request_id`) back to the
        // LLM. Earlier versions printed env-var setup lines that placed
        // the live bearer-equivalent credential into the conversation
        // transcript, where it could be exfiltrated by any downstream
        // consumer of the LLM's output. AuthManager.completeAuthentication
        // (called above) has already auto-persisted (request_id, auth_token)
        // to the on-disk credential cache, so subsequent runs of this
        // server resume without re-auth without ever needing to read the
        // token from a transcript.
        return [
          {
            type: 'text',
            text: `✅ Authentication successful!

You are now logged in to JauMemory as user ${userId}. Credentials have been stored locally and will be reused on subsequent server runs — no environment variables required.

You can now use all JauMemory tools (remember, recall, forget, analyze, etc.).`
          }
        ];
      } catch (error: any) {
        logger.error('MCP authentication failed:', error);

        // Extract error message without circular references
        let errorMsg = 'Unknown authentication error';

        if (error.response?.data?.detail) {
          errorMsg = error.response.data.detail;
        } else if (error.response?.data?.error) {
          errorMsg = error.response.data.error;
        } else if (error.message) {
          errorMsg = error.message;
        } else if (typeof error === 'string') {
          errorMsg = error;
        } else {
          // Avoid [object Object] - use safe stringification
          try {
            errorMsg = JSON.stringify(error, null, 2);
          } catch {
            errorMsg = 'Authentication failed - please check your auth token and try again';
          }
        }

        // Return a simple error message without circular references
        const cleanError = new Error(`Authentication failed: ${errorMsg}`);
        throw cleanError;
      }
    }
  };
}
