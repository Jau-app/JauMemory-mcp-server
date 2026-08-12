# MCP Authentication Flow

## Overview
The JauMemory MCP server uses a secure 3-step authentication flow with dual verification. No passwords or database credentials are ever stored in environment variables.

## Step-by-Step Authentication

### 1. Initial Setup
Set only these environment variables (one-time):
```bash
export JAUMEMORY_USERNAME=your_username
export JAUMEMORY_EMAIL=your_email@example.com
```

These are ONLY used to generate the approval link - they are NOT credentials.

### 2. Start MCP Server
```bash
npm run start
```

The server will:
- Generate a login request containing date_nonce, connection_name, and a
  request_hash (no username or email is ever sent — they are only inputs
  to the locally computed hash)
- Send this to the backend server
- Receive a request_id and approval URL
- Display the URL in the console

> Deprecation note (0.5.1): this environment-driven startup flow is
> deprecated and will be removed in 0.6.0. The supported flow is the
> `mcp_login` + `mcp_authenticate` tools.

### 3. Web Approval
- Open the approval URL in your browser
- Log in to your JauMemory account (if not already logged in)
- Click "Approve" to authorize the MCP connection
- **IMPORTANT**: Copy the authentication code shown (e.g., "happy-star")

### 4. Dual Verification
The server implements dual verification for maximum security:
- The backend sends an encrypted auth token to the MCP server
- You see the plain token in your web browser
- You must provide this token to the MCP server

Set the token:
```bash
export JAUMEMORY_AUTH_TOKEN_MANUAL=happy-star
```

Then restart the MCP server. It will:
- Decrypt the token received from the server
- Compare it with your manually provided token
- Only proceed if both match exactly

### 5. Authentication Complete
Once authenticated, the MCP server receives a JWT token and can access the API.

## Security Features

1. **No Password Transmission**: Passwords never leave the web interface
2. **Dual Verification**: Requires both encrypted channel AND manual verification
3. **Time-Limited**: All tokens have expiration times
4. **One-Time Tokens**: Auth tokens can only be used once
5. **SHA-512 Hashing**: Tokens are hashed before storage
6. **User Context**: Approval requires active user session

## Troubleshooting

### "Authentication tokens do not match"
- Ensure you copied the exact token from the web browser
- Check for extra spaces or typos
- The token is case-sensitive

### "Request expired"
- The approval link expires after 5 minutes
- Restart the MCP server to generate a new request

### "Cannot approve request for different user"
- The username/email must match your logged-in account
- Use the correct username and email for your account

## Environment Variables Summary

Required for first authentication:
- `JAUMEMORY_USERNAME` - Your account username
- `JAUMEMORY_EMAIL` - Your account email

Required for dual verification:
- `JAUMEMORY_AUTH_TOKEN_MANUAL` - The token shown in browser

Configuration (optional):
- `JAUMEMORY_API_URL` - API endpoint (default: https://mem.jau.app)
- `JAUMEMORY_GRPC_URL` - gRPC endpoint (default: mem.jau.app:50051)

After successful authentication, the server caches credentials for reconnection.