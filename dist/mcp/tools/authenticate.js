/**
 * MCP Authenticate Tool
 *
 * Completes the authentication flow with the auth token from web approval
 */
import { logger } from '../../utils/logger.js';
export function authenticateTool(clients) {
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
        handler: async (args) => {
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
                return [
                    {
                        type: 'text',
                        text: `✅ Authentication successful!

🎉 You are now logged in to JauMemory!

User ID: ${userId}

✅ You can now use all JauMemory tools:
   - remember: Store new memories
   - recall: Search your memories
   - forget: Delete memories
   - analyze: Analyze memory patterns
   - And many more!

💾 To save credentials for future sessions, add to your environment:
   JAUMEMORY_REQUEST_ID=${request_id}
   JAUMEMORY_AUTH_TOKEN=${auth_token}`
                    }
                ];
            }
            catch (error) {
                logger.error('MCP authentication failed:', error);
                // Extract error message without circular references
                let errorMsg = 'Unknown authentication error';
                if (error.response?.data?.detail) {
                    errorMsg = error.response.data.detail;
                }
                else if (error.response?.data?.error) {
                    errorMsg = error.response.data.error;
                }
                else if (error.message) {
                    errorMsg = error.message;
                }
                else if (typeof error === 'string') {
                    errorMsg = error;
                }
                else {
                    // Avoid [object Object] - use safe stringification
                    try {
                        errorMsg = JSON.stringify(error, null, 2);
                    }
                    catch {
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
//# sourceMappingURL=authenticate.js.map