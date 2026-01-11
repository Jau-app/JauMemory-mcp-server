/**
 * MCP Login Tool
 *
 * Allows the MCP client to initiate the authentication flow
 */
import axios from 'axios';
import { logger } from '../../utils/logger.js';
export function loginTool(clients) {
    return {
        name: 'mcp_login',
        description: 'Initiate MCP authentication flow. Provide your REAL JauMemory username and email to start the manual approval process. NOTE: You MUST click the link provided and approve in your browser. Test accounts will not work. Username and email can be optionally set via JAUMEMORY_USERNAME and JAUMEMORY_EMAIL environment variables.',
        inputSchema: {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    description: 'Your REAL JauMemory username (not a test account). Optional if set in JAUMEMORY_USERNAME env var.'
                },
                email: {
                    type: 'string',
                    description: 'Your REAL JauMemory email address (must match your registered account). Optional if set in JAUMEMORY_EMAIL env var.'
                }
            },
            required: []
        },
        handler: async (args) => {
            try {
                // Check for username and email from args or environment
                const username = args.username || process.env.JAUMEMORY_USERNAME;
                const email = args.email || process.env.JAUMEMORY_EMAIL;
                if (!username || !email) {
                    throw new Error('Username and email are required. Provide them as parameters or set JAUMEMORY_USERNAME and JAUMEMORY_EMAIL environment variables.');
                }
                logger.info('Initiating MCP login...', { username, email });
                // Use the auth manager from clients
                const authManager = clients.auth.authManager;
                let { requestId, approvalUrl } = await authManager.login(username, email);
                // Fix approval URL if it contains IP address instead of domain
                if (approvalUrl.includes('216.238.91.120:8091')) {
                    approvalUrl = approvalUrl.replace('http://216.238.91.120:8091', 'https://mem.jau.app');
                }
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
5. ✅ Come back here and use mcp_authenticate with:
   - request_id: ${requestId}
   - auth_token: [the code from the webpage]

⏱️ This approval link expires in 5 minutes.
❌ Test accounts or mock data will NOT work - use your real JauMemory credentials.`
                    }
                ];
            }
            catch (error) {
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
//# sourceMappingURL=login.js.map