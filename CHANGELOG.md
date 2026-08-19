# Changelog

All notable changes to JauMemory MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-08-18

### 📝 Documentation accuracy (no code behavior changes)
- `skill_schedule.timezone`: the server accepts **UTC only** — other zones
  are now rejected server-side; express cron expressions in UTC.
- `skill_schedule.notify_on_failure` / `notify_on_success`: marked
  **reserved** — stored but currently inert (no notification is sent).
- `skill_execute.step_overrides`: marked **reserved** — any non-empty map
  is rejected by the server.
- `vault_store.provider`: corrected — it is an organizational label only
  and does **not** auto-configure auth headers; `injection_method` is a
  stored preference and execution currently always injects via the auth
  header.
- The `fetch` tool-catalog entries updated to match all of the above.

## [0.3.2] - 2025-10-22

### 🔒 Security
- **CRITICAL FIX**: Replaced weak SHA-256 hash with PBKDF2 key derivation function (100,000 iterations)
- **Salt Generation**: Added cryptographically secure random salt generation and persistence
- **Key Strengthening**: Encryption keys now use proper KDF with NIST-recommended parameters for 2025
- **File Permissions**: Salt and credential files restricted to user-only access (0600 on Unix)
- **Defense in Depth**: Dual-layer security with OS keychain (primary) and encrypted file (fallback)

### Fixed
- **Windows Installation Issues**: Resolved `TAR_ENTRY_ERROR` errors on Windows by making `keytar` an optional dependency
- **TypeScript Compilation**: Fixed TypeScript errors when `keytar` is not available
- **Key Derivation Vulnerability**: Fixed critical weakness where encryption keys were predictable (CVE pending)

### Added
- **Secure Encrypted Storage**: Credentials encrypted with AES-256-GCM using PBKDF2-derived keys
- **Smart Credential Storage**: Automatically tries OS keychain (via keytar) first, falls back to encrypted file storage
- **Salt Management**: Persistent random salt generation for key derivation
- **Cross-Platform Support**: Better Windows compatibility while maintaining macOS/Linux keychain integration

### Changed
- Moved `keytar` from dependencies to optionalDependencies to prevent installation failures
- Enhanced `AuthManager` with cryptographically secure key derivation
- Updated `uninstall.ts` to handle optional keytar gracefully
- Encryption key derivation now uses PBKDF2 instead of simple SHA-256

## [0.3.1] - 2025-10-20

### Added
- Initial public release
- MCP authentication flow with web approval
- Full CRUD operations for memories
- Multi-agent coordination features
- Pattern analysis and consolidation
- Cloud backend integration (mem.jau.app)

### Security
- JWT-based authentication
- Encrypted credential storage via keytar
- Secure gRPC communication
- User isolation and access control

---

## Release Notes

### Upgrading from 0.3.1 to 0.3.2

No breaking changes. Existing installations will continue to work. If you're on Windows and experienced installation issues with 0.3.1, please:

1. Clear npm cache: `npm cache clean --force`
2. Reinstall: `npm install -g @jaumemory/mcp-server` or use `npx -y @jaumemory/mcp-server`

Your existing credentials will continue to work seamlessly.

### What's Next

- Enhanced multi-agent workflows
- Improved search capabilities
- Additional export formats
- Performance optimizations
