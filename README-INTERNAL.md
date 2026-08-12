# JauAuth MCP Server

A Model Context Protocol (MCP) server that connects Claude Desktop to the JauMemory production service.

## Features

- 🔐 Secure authentication with JauMemory cloud service
- 🔄 Automatic JWT token refresh
- 🔒 TLS/SSL connections for production
- 💾 Credential caching for seamless reconnection
- 🛠️ Full access to JauMemory tools through Claude

## Prerequisites

- Node.js 18+ installed
- A JauMemory account (sign up at https://mem.jau.app)
- Claude Desktop installed

## Installation

```bash
# Clone the repository
git clone https://github.com/Jau-app/jaumemory-mcp-server.git
cd jaumemory-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

### Step 1: Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

### Step 2: Authenticate

Authentication happens through the MCP tools — no credentials go in any
file. Start the server, then from your MCP client run `mcp_login`, open
the approval URL it prints, approve in the browser, and complete with
`mcp_authenticate` using the code shown plus the request_id from
`mcp_login`.

```bash
npm start
```

You'll see:
1. `mcp_login` returns an approval URL and a request_id
2. Open the URL, log in to JauMemory, and approve the connection
3. Complete with `mcp_authenticate` using the code shown plus the request_id
4. Credentials are cached securely (OS keychain when available); later
   sessions reconnect and refresh automatically

### Step 3: Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jaumemory": {
      "command": "node",
      "args": ["/absolute/path/to/jaumemory-mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Replace `/absolute/path/to/jaumemory-mcp-server` with the actual path to your installation.

## Usage

Once configured, you can use JauMemory tools in Claude:

### Basic Memory Operations

```javascript
// Store a memory
remember({ 
  content: "Learned about async/await in JavaScript",
  tags: ["programming", "javascript"],
  importance: 0.8
})

// Search memories
recall({ query: "javascript async" })

// Update a memory
update({ 
  memoryId: "abc123...",
  content: "Updated content",
  tags: ["revised"]
})

// Delete a memory
forget({ memoryId: "abc123..." })
```

### Advanced Features

```javascript
// Analyze patterns in your memories
analyze({ timeRange: "week" })

// Consolidate related memories
consolidate({ dryRun: false })
```

## Security

### Auth Hash Storage

The auth hash is stored in `.auth-cache/credentials.json` for automatic reconnection. This file contains:
- Encrypted auth hash
- JWT tokens (short-lived)
- User ID

**Important**: Keep this file secure and don't share it.

### Token Management

- JWT tokens are automatically refreshed before expiry
- Auth sessions last 30 days by default
- All connections use TLS/SSL in production

### Best Practices

1. **Never commit `.env` files** to version control
2. **Keep your auth hash secret** - it provides full access to your memories
3. **Use strong passwords** for your JauMemory account
4. **Enable 2FA** on your JauMemory account for extra security

## Troubleshooting

### Authentication Failed

1. Check your credentials in `.env`
2. Ensure you've approved the connection in the web UI
3. Try deleting `.auth-cache/` and re-authenticating

### Connection Errors

1. Check your internet connection
2. Verify the API URLs in `.env` are correct
3. Check if JauMemory service is operational

### Token Expired

The server automatically refreshes tokens, but if you see auth errors:
1. Delete `.auth-cache/credentials.json`
2. Restart the server to re-authenticate

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JAUMEMORY_API_URL` | API endpoint (https required; http only on localhost) | `https://mem.jau.app` |
| `JAUMEMORY_GRPC_URL` | gRPC endpoint (must pair with the API issuer) | `mem.jau.app:50051` |
| `JAUMEMORY_GRPC_USE_TLS` | gRPC TLS (false allowed only for loopback) | `true` |
| `JAUMEMORY_GRPC_PINNED_SHA256` | Optional cert-pin fingerprint | - |
| `MCP_SERVER_NAME` / `MCP_SERVER_VERSION` | Reported MCP identity | `jaumemory` / pkg version |
| `MCP_TOOL_LOADING` | Tool loading mode | `flat` |
| `LOG_LEVEL` | Logging level | `info` |
| `NODE_ENV` | Environment | `production` |

Authentication uses the `mcp_login` / `mcp_authenticate` tools; no
credential variables are supported in configuration files.

## Support

- **Issues**: https://github.com/Jau-app/jaumemory-mcp-server/issues
- **Documentation**: https://jau.app/docs
- **Email**: support@jau.app

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request