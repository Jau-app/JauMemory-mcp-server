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
     * Get encryption key derived from machine-specific data using proper KDF
     * Uses PBKDF2 with persistent salt for secure key derivation
     */
    private getOrCreateEncryptionKey;
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