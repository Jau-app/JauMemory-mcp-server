#!/usr/bin/env node
/**
 * JauAuth MCP Server
 *
 * Production MCP server for connecting Claude Desktop to JauMemory cloud service.
 *
 * AUTHENTICATION FLOW:
 * 1. On first run, set these environment variables:
 *    - JAUMEMORY_USERNAME=your_username
 *    - JAUMEMORY_EMAIL=your_email@example.com
 *
 * 2. The MCP server will:
 *    - Send login request with username, email, connection_name, date_nonce
 *    - Display an approval URL
 *    - Wait for you to approve in your web browser (must be logged in)
 *
 * 3. Dual Verification:
 *    - Server sends encrypted auth token to MCP
 *    - You see the plain token in web browser
 *    - You must provide the token to MCP (via JAUMEMORY_AUTH_TOKEN_MANUAL env var)
 *    - Both must match for authentication to succeed
 *
 * 4. After authentication, the MCP server receives a JWT token for API access
 *
 * NO PASSWORDS OR DATABASE CREDENTIALS IN ENVIRONMENT VARIABLES!
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config();
// Import authentication manager
import { AuthManager } from './auth/AuthManager.js';
// Import tools, resources, and prompts
import { setupTools } from './mcp/tools/index.js';
import { setupResources } from './mcp/resources/index.js';
import { setupPrompts } from './mcp/prompts/index.js';
// Import backend clients
import { createMemoryClient } from './client/memory.js';
import { createVectorClient } from './client/vector.js';
import { createPatternClient } from './client/pattern.js';
import { createConsolidationClient } from './client/consolidation.js';
import { createAgentClient } from './client/agent.js';
import { createCollectionsClient } from './client/collections.js';
// Logger setup
import { logger } from './utils/logger.js';
async function main() {
    logger.info('Starting JauAuth MCP Server...');
    try {
        // Initialize authentication manager (without requiring authentication)
        const authManager = new AuthManager();
        await authManager.initialize();
        // Initialize backend clients with lazy auth
        const clients = {
            memory: await createMemoryClient(authManager),
            vector: await createVectorClient(authManager),
            pattern: await createPatternClient(authManager),
            consolidation: await createConsolidationClient(authManager),
            agent: await createAgentClient(authManager),
            collections: await createCollectionsClient(authManager),
            auth: {
                getCurrentUserId: async () => {
                    const userId = await authManager.getUserId();
                    if (!userId) {
                        throw new Error('Not authenticated. Please use the mcp_login tool first.');
                    }
                    return userId;
                },
                getAuthHeaders: async () => authManager.getAuthHeaders(),
                clearSession: async () => authManager.clearSession(),
                authManager // Expose authManager for login tool
            }
        };
        // Create MCP server
        const server = new Server({
            name: process.env.MCP_SERVER_NAME || 'jauauth',
            version: process.env.MCP_SERVER_VERSION || '1.0.0'
        }, {
            capabilities: {
                tools: {},
                resources: {},
                prompts: {}
            }
        });
        // Setup tools
        const tools = setupTools(clients);
        // Handle tool listing
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: Object.entries(tools).map(([_, tool]) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }))
            };
        });
        // Handle tool calls
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            logger.debug(`Tool called: ${name}`, { args });
            const tool = tools[name];
            if (!tool) {
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
            }
            try {
                const result = await tool.handler(args);
                // If result is already in MCP format with content array, return as-is
                if (Array.isArray(result) && result.length > 0 && result[0].type) {
                    return { content: result };
                }
                // Otherwise wrap it (for backward compatibility)
                return { content: result };
            }
            catch (error) {
                logger.error(`Tool error: ${name}`, error);
                // Check if it's an auth error
                if (error instanceof Error && error.message.includes('401')) {
                    // Try to refresh token
                    await authManager.refreshToken();
                    // Retry the operation
                    const result = await tool.handler(args);
                    if (Array.isArray(result) && result.length > 0 && result[0].type) {
                        return { content: result };
                    }
                    return { content: result };
                }
                // Extract a clean error message
                let errorMessage = 'Unknown error';
                if (error instanceof Error) {
                    errorMessage = error.message;
                    // Check if the message is "[object Object]" and try to extract better info
                    if (errorMessage === '[object Object]' || errorMessage.includes('[object Object]')) {
                        errorMessage = error.stack?.split('\n')[0] || 'Authentication failed';
                    }
                }
                else if (typeof error === 'string') {
                    errorMessage = error;
                }
                else if (error && typeof error === 'object') {
                    try {
                        errorMessage = JSON.stringify(error);
                    }
                    catch (e) {
                        errorMessage = 'Failed to serialize error';
                    }
                }
                throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${errorMessage}`);
            }
        });
        // Setup resources
        const resources = setupResources(clients);
        // Handle resource listing
        server.setRequestHandler(ListResourcesRequestSchema, async () => {
            return {
                resources: Object.values(resources).map(r => ({
                    uri: r.uri,
                    name: r.name,
                    description: r.description,
                    mimeType: r.mimeType
                }))
            };
        });
        // Handle resource reading
        server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            const resource = Object.values(resources).find(r => r.uri === uri);
            if (!resource) {
                throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
            }
            try {
                const content = await resource.handler();
                return {
                    contents: [{
                            uri,
                            mimeType: resource.mimeType,
                            text: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
                        }]
                };
            }
            catch (error) {
                logger.error(`Resource error: ${uri}`, error);
                throw new McpError(ErrorCode.InternalError, `Resource read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        // Setup prompts
        const prompts = setupPrompts(clients);
        // Handle prompt listing
        server.setRequestHandler(ListPromptsRequestSchema, async () => {
            return {
                prompts: Object.values(prompts).map(p => ({
                    name: p.name,
                    description: p.description,
                    arguments: p.arguments
                }))
            };
        });
        // Handle prompt retrieval
        server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            const prompt = prompts[name];
            if (!prompt) {
                throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
            }
            try {
                const result = await prompt.handler(args || {});
                return {
                    messages: [{
                            role: 'user',
                            content: {
                                type: 'text',
                                text: result
                            }
                        }]
                };
            }
            catch (error) {
                logger.error(`Prompt error: ${name}`, error);
                throw new McpError(ErrorCode.InternalError, `Prompt generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        // Start server with stdio transport
        const transport = new StdioServerTransport();
        await server.connect(transport);
        logger.info('JauAuth MCP Server started successfully');
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Shutting down...');
            await authManager.cleanup();
            await server.close();
            process.exit(0);
        });
    }
    catch (error) {
        logger.error('Failed to start server:', error);
        if (error instanceof Error && error.message.includes('authenticate')) {
            logger.error('Authentication failed. Please check your credentials in .env file');
            logger.error('You can either provide JAUMEMORY_AUTH_HASH or username/password/email for initial setup');
        }
        process.exit(1);
    }
}
// Run the server
main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map