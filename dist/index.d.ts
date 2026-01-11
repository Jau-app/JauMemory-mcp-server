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
export {};
//# sourceMappingURL=index.d.ts.map