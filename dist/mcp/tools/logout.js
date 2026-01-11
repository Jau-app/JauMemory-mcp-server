/**
 * MCP Logout Tool
 *
 * Revokes the current MCP session
 */
import axios from 'axios';
import { logger } from '../../utils/logger.js';
export function logoutTool(clients) {
    return {
        name: 'mcp_logout',
        description: 'Logout and revoke the current MCP session.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        },
        handler: async (_args) => {
            try {
                // Get API URL from environment
                const apiUrl = process.env.JAUMEMORY_API_URL;
                if (!apiUrl) {
                    throw new Error('JAUMEMORY_API_URL environment variable is required');
                }
                // Get current auth headers from the auth manager
                const authHeaders = await clients.auth.getAuthHeaders?.();
                if (!authHeaders) {
                    throw new Error('No active session to logout');
                }
                logger.info('Logging out MCP session...');
                // Call logout endpoint
                await axios.post(`${apiUrl}/v1/auth/logout`, {}, {
                    headers: {
                        ...authHeaders,
                        'Content-Type': 'application/json'
                    }
                });
                // Clear cached credentials from AuthManager
                await clients.auth.clearSession?.();
                return [
                    {
                        type: 'text',
                        text: `Successfully logged out. 

To authenticate again, use the mcp_login tool.`
                    }
                ];
            }
            catch (error) {
                logger.error('MCP logout failed:', error);
                if (axios.isAxiosError(error)) {
                    const errorMsg = error.response?.data?.detail || error.message;
                    throw new Error(`Logout failed: ${errorMsg}`);
                }
                throw error;
            }
        }
    };
}
//# sourceMappingURL=logout.js.map