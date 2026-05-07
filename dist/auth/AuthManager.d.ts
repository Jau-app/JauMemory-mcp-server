/**
 * Authentication Manager
 *
 * Handles the 3-step MCP authentication flow and JWT token management
 */
export declare class AuthManager {
    private apiUrl;
    private credentials?;
    private cacheFile;
    constructor();
    initialize(): Promise<void>;
    /**
     * A11 migration: if a legacy cache exists in `<cwd>/.auth-cache/` and the new
     * user-home location does not, move both `credentials.json` and the `.salt`
     * sibling. Best-effort — failures are logged and ignored (we'll fall through
     * to first-run auth, same as if no cache existed).
     */
    private migrateLegacyCacheIfNeeded;
    getUserId(): Promise<string | null>;
    getAuthHeaders(): Promise<Record<string, string>>;
    authenticate(): Promise<void>;
    private promptForCredentials;
    private performMcpLogin;
    private authenticateWithToken;
    login(username: string, email: string): Promise<{
        requestId: string;
        approvalUrl: string;
    }>;
    completeAuthentication(requestId: string, authToken: string): Promise<void>;
    refreshToken(): Promise<void>;
    private isTokenExpired;
    private deriveRequestKey;
    private decryptAuthToken;
    /**
     * Get encryption key derived from machine-specific data using proper KDF.
     * Uses PBKDF2 (100k iter, SHA-256) with persistent salt.
     *
     * A11 hardening:
     *  - Parent dir is 0o700; salt file is 0o600 (UNIX).
     *  - Regenerate the salt if the on-disk salt file is looser than 0o600.
     *  - Pre-seeded-cache defense: if a salt file exists but no cache file
     *    accompanies it AND the salt's mtime predates this process start, the
     *    salt was almost certainly planted (no legitimate code path leaves a
     *    salt around without a cache, and a freshly-launched process should
     *    not inherit a cwd-untouched salt on a clean install). Regenerate.
     *    Once a legitimate cache exists, the salt is implicitly trusted across
     *    process restarts.
     *
     * Returns the raw 32-byte key (used directly with AES-256-GCM).
     */
    private getOrCreateEncryptionKey;
    /**
     * AES-256-GCM encrypt: returns base64(nonce(12) || ciphertext || authTag(16)).
     * Key MUST be 32 bytes.
     */
    private encryptCacheBlob;
    /**
     * AES-256-GCM decrypt of base64(nonce(12) || ciphertext || authTag(16)).
     * Returns null if the input does not match the expected GCM format
     * (legacy CryptoJS-OpenSSL "Salted__" envelopes will land here and produce
     * null — the caller deletes the cache and forces re-auth).
     */
    private decryptCacheBlob;
    /**
     * Delete the cache + salt files (best-effort). Used when we detect a legacy
     * CryptoJS-format cache and want a clean slate before forcing re-auth.
     */
    private deleteCacheAndSalt;
    /**
     * Try to use keytar (OS keychain) if available, otherwise fall back to encrypted file
     */
    private loadCachedCredentials;
    private saveCachedCredentials;
    /**
     * Try to load credentials from OS keychain using keytar (optional dependency)
     */
    private tryLoadFromKeytar;
    /**
     * Try to save credentials to OS keychain using keytar (optional dependency)
     */
    private trySaveToKeytar;
    clearSession(): Promise<void>;
    cleanup(): Promise<void>;
    private promptForAuthToken;
}
//# sourceMappingURL=AuthManager.d.ts.map