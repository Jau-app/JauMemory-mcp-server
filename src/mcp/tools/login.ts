/**
 * MCP Login Tool
 * 
 * Allows the MCP client to initiate the authentication flow
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import axios from 'axios';
import { logger } from '../../utils/logger.js';

export function loginTool(clients: BackendClients): Tool {
  return {
    name: 'mcp_login',
    description: 'Initiate MCP authentication flow. Provide your REAL JauMemory username and email to start the manual approval process. NOTE: You MUST click the link provided and approve in your browser. Test accounts will not work.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Your REAL JauMemory username (not a test account)'
        },
        email: {
          type: 'string',
          description: 'Your REAL JauMemory email address (must match your registered account)'
        }
      },
      required: ['username', 'email']
    },
    handler: async (args: any) => {
      try {
        const { username, email } = args;
        
        logger.info('Initiating MCP login...', { username, email });
        
        // Use the auth manager from clients
        const authManager = clients.auth.authManager;
        const { requestId, approvalUrl } = await authManager.login(username, email);
        
        // Store request ID in authManager for later use
        // This would normally be stored in AuthManager, but for the tool we'll return it
        
        return [
          {
            type: 'text',
            text: `MCP authentication initiated successfully!

📋 Request ID: ${requestId}

🔗 CLICK THIS LINK TO APPROVE: ${approvalUrl}

⚠️ IMPORTANT - Manual Steps Required:
1. ✅ CLICK the link above to open it in your browser
2. ✅ Log in to your JauMemory account with the SAME username/email you provided
3. ✅ Click the "Approve" button to authorize this MCP connection
4. ✅ COPY the authentication code shown (e.g., "happy-star")
5. ✅ Come back here and call mcp_authenticate with these parameters:

mcp_authenticate schema:
  - request_id (string, required): "${requestId}"
  - auth_token (string, required): the EXACT code from the approval webpage (e.g., "happy-star")

⏱️ This approval link expires in 5 minutes.
❌ Test accounts or mock data will NOT work - use your real JauMemory credentials.`
          }
        ];
      } catch (error) {
        logger.error('MCP login failed:', error);
        
        if (axios.isAxiosError(error)) {
          const errorMsg = error.response?.data?.detail || error.message;
          throw new Error(`Login failed: ${errorMsg}`);
        }
        
        throw error;
      }
    }
  };
}