/**
 * Authentication Manager
 *
 * Handles the 3-step MCP authentication flow and JWT token management
 */
import axios from 'axios';
import { createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import CryptoJS from 'crypto-js';
import { logger } from '../utils/logger.js';
export class AuthManager {
    apiUrl;
    credentials;
    cacheFile;
    constructor() {
        // Default to production API if not specified
        this.apiUrl = process.env.JAUMEMORY_API_URL || 'https://mem.jau.app';
        this.cacheFile = path.join(process.cwd(), '.auth-cache', 'credentials.json');
        // Log configuration (without sensitive data)
        logger.debug('AuthManager initialized', {
            apiUrl: this.apiUrl,
            environment: process.env.NODE_ENV || 'development'
        });
    }
    async initialize() {
        // Try to load cached credentials
        await this.loadCachedCredentials();
        // Don't require authentication on startup
        // Authentication will happen when user calls login tool
    }
    async getUserId() {
        return this.credentials?.userId || null;
    }
    async getAuthHeaders() {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        // Check if token needs refresh
        if (this.isTokenExpired()) {
            await this.refreshToken();
        }
        return {
            'authorization': `Bearer ${this.credentials.jwtToken}`,
            'x-sync-id': this.credentials.syncId,
            'x-user-id': this.credentials.userId
        };
    }
    async authenticate() {
        // Check if we have cached credentials from previous session
        const requestId = process.env.JAUMEMORY_REQUEST_ID;
        const authToken = process.env.JAUMEMORY_AUTH_TOKEN;
        if (requestId && authToken) {
            try {
                await this.authenticateWithToken(requestId, authToken);
                return;
            }
            catch (error) {
                logger.warn('Cached authentication failed, starting new flow');
            }
        }
        // Otherwise, perform initial authentication
        await this.performMcpLogin();
    }
    async promptForCredentials() {
        // Check if credentials are provided via environment (for CI/CD)
        if (process.env.JAUMEMORY_USERNAME && process.env.JAUMEMORY_EMAIL) {
            return {
                username: process.env.JAUMEMORY_USERNAME,
                email: process.env.JAUMEMORY_EMAIL
            };
        }
        // In MCP context, we need to throw an error with instructions
        throw new Error('\n\n=== MCP AUTHENTICATION REQUIRED ===\n' +
            'Please set the following environment variables:\n' +
            '  JAUMEMORY_USERNAME=your_username\n' +
            '  JAUMEMORY_EMAIL=your_email@example.com\n' +
            '\nThen restart the MCP server to begin authentication.\n' +
            'These are only used to generate the approval link, not for login.\n');
    }
    async performMcpLogin() {
        // Check API URL is set
        if (!this.apiUrl) {
            throw new Error('JAUMEMORY_API_URL environment variable is required. Please set it to your JauMemory API endpoint.');
        }
        logger.info('Starting MCP authentication flow...');
        // Get username and email from user
        const { username, email } = await this.promptForCredentials();
        logger.info(`Authenticating as: ${username} (${email})`);
        // Step 1: Initiate login with hash (no username/email sent)
        const dateNonce = new Date().toISOString();
        const connectionName = `${process.env.MCP_SERVER_NAME || 'JauMemory'} MCP Server`;
        // Generate request hash from user credentials
        const hash = createHash('sha512');
        hash.update(`${username}:${email}:${dateNonce}:${connectionName}`);
        const requestHash = hash.digest('hex');
        let request_id;
        let approval_url;
        try {
            const loginResponse = await axios.post(`${this.apiUrl}/v1/auth/mcp/login`, {
                date_nonce: dateNonce,
                connection_name: connectionName,
                request_hash: requestHash
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            request_id = loginResponse.data.request_id;
            approval_url = loginResponse.data.approval_url;
            logger.info('MCP login initiated. Please approve the connection:');
            logger.info(`Approval URL: ${approval_url}`);
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error('Failed to initiate MCP login:', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data
                });
                throw new Error(`MCP login failed: ${error.response?.data?.detail || error.message}`);
            }
            throw error;
        }
        // Derive request key for decryption
        const requestKey = this.deriveRequestKey(username, email, connectionName, dateNonce);
        // Step 2: Poll for approval
        let approved = false;
        let encryptedAuthToken;
        const maxAttempts = 60; // 5 minutes with 5-second intervals
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            try {
                const checkResponse = await axios.post(`${this.apiUrl}/v1/auth/mcp/check`, {
                    request_id
                });
                if (checkResponse.data.approved && checkResponse.data.encrypted_auth_token) {
                    approved = true;
                    encryptedAuthToken = checkResponse.data.encrypted_auth_token;
                    break;
                }
            }
            catch (error) {
                // Continue polling
            }
            if (i % 12 === 0 && i > 0) { // Every minute
                logger.info('Still waiting for approval...');
            }
        }
        if (!approved || !encryptedAuthToken) {
            throw new Error('MCP authentication timed out or was not approved');
        }
        logger.info('MCP connection approved!');
        // Decrypt the auth token received from server
        const decryptedAuthToken = this.decryptAuthToken(encryptedAuthToken, requestKey);
        logger.debug('Decrypted auth token from server');
        // Prompt user for the auth token they copied from web UI
        logger.info('\n=== DUAL VERIFICATION REQUIRED ===');
        logger.info('Please enter the authentication code shown in your web browser:');
        logger.info('(This is an additional security measure to protect your memories)\n');
        const userProvidedToken = await this.promptForAuthToken();
        // Verify both tokens match
        if (decryptedAuthToken !== userProvidedToken) {
            throw new Error('Authentication tokens do not match. Security verification failed.');
        }
        logger.info('Security verification successful!');
        // Step 3: Authenticate with request_id and auth_token
        await this.authenticateWithToken(request_id, userProvidedToken);
        // Save credentials for future use
        logger.info('Authentication successful!');
        logger.info(`Add these to your .env file for future sessions:`);
        logger.info(`JAUMEMORY_REQUEST_ID=${request_id}`);
        logger.info(`JAUMEMORY_AUTH_TOKEN=${userProvidedToken}`);
    }
    async authenticateWithToken(requestId, authToken) {
        // Generate sync_id: SHA-256(request_id + auth_token)
        const syncId = createHash('sha256');
        syncId.update(requestId);
        syncId.update(authToken);
        const syncIdHex = syncId.digest('hex');
        logger.debug('Authenticating with sync_id approach');
        try {
            const authResponse = await axios.post(`${this.apiUrl}/v1/auth/mcp/authenticate`, {
                sync_id: syncIdHex
            });
            const { access_token, expires_in, user_id } = authResponse.data;
            this.credentials = {
                requestId,
                authToken,
                userId: user_id,
                jwtToken: access_token,
                jwtExpiry: Date.now() + (expires_in * 1000),
                syncId: syncIdHex
            };
            await this.saveCachedCredentials();
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error('Authentication failed:', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data
                });
                // Better error extraction
                let errorMessage = 'Unknown error';
                if (error.response?.data) {
                    if (typeof error.response.data === 'string') {
                        errorMessage = error.response.data;
                    }
                    else if (error.response.data.detail) {
                        errorMessage = error.response.data.detail;
                    }
                    else if (error.response.data.error) {
                        errorMessage = error.response.data.error;
                    }
                    else if (error.response.data.message) {
                        errorMessage = error.response.data.message;
                    }
                    else {
                        // Try to stringify, but handle circular references
                        try {
                            errorMessage = JSON.stringify(error.response.data);
                        }
                        catch (e) {
                            errorMessage = 'Authentication failed (serialization error)';
                        }
                    }
                }
                else if (error.message) {
                    errorMessage = error.message;
                }
                // Create a clean error without any circular references or non-serializable properties
                const cleanError = new Error(`Authentication failed: ${errorMessage}`);
                // Don't attach the original error object to avoid circular references
                throw cleanError;
            }
            // Handle non-axios errors
            if (error instanceof Error) {
                throw error;
            }
            else if (typeof error === 'string') {
                throw new Error(`Authentication failed: ${error}`);
            }
            else {
                // Unknown error type - try to extract message
                let msg = 'Authentication failed';
                try {
                    if (error && typeof error === 'object' && 'message' in error) {
                        msg = String(error.message);
                    }
                    else {
                        msg = String(error);
                    }
                }
                catch (e) {
                    // Can't convert to string
                }
                throw new Error(msg);
            }
        }
    }
    // Public method for login tool
    async login(username, email) {
        // Check API URL is set
        if (!this.apiUrl) {
            throw new Error('JAUMEMORY_API_URL environment variable is required. Please set it to your JauMemory API endpoint.');
        }
        logger.info('Starting MCP authentication flow...');
        logger.info(`Authenticating as: ${username} (${email})`);
        // Step 1: Initiate login with hash (no username/email sent)
        const dateNonce = new Date().toISOString();
        const connectionName = `${process.env.MCP_SERVER_NAME || 'JauMemory'} MCP Server`;
        // Generate request hash from user credentials
        const hash = createHash('sha512');
        hash.update(`${username}:${email}:${dateNonce}:${connectionName}`);
        const requestHash = hash.digest('hex');
        try {
            const loginResponse = await axios.post(`${this.apiUrl}/v1/auth/mcp/login`, {
                date_nonce: dateNonce,
                connection_name: connectionName,
                request_hash: requestHash
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return {
                requestId: loginResponse.data.request_id,
                approvalUrl: loginResponse.data.approval_url
            };
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error('Failed to initiate MCP login:', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data
                });
                throw new Error(`MCP login failed: ${error.response?.data?.detail || error.message}`);
            }
            throw error;
        }
    }
    // Public method for authenticate tool
    async completeAuthentication(requestId, authToken) {
        await this.authenticateWithToken(requestId, authToken);
    }
    async refreshToken() {
        if (!this.credentials) {
            throw new Error('No credentials to refresh');
        }
        logger.debug('Refreshing JWT token...');
        try {
            await this.authenticateWithToken(this.credentials.requestId, this.credentials.authToken);
        }
        catch (error) {
            logger.error('Failed to refresh token:', error);
            throw new Error('Token refresh failed. Please re-authenticate.');
        }
    }
    isTokenExpired() {
        if (!this.credentials)
            return true;
        // Refresh 5 minutes before expiry
        const bufferTime = 5 * 60 * 1000;
        return Date.now() >= (this.credentials.jwtExpiry - bufferTime);
    }
    deriveRequestKey(username, email, connectionName, dateNonce) {
        const hash = createHash('sha512');
        hash.update(username);
        hash.update(':');
        hash.update(email);
        hash.update(':');
        hash.update(connectionName);
        hash.update(':');
        hash.update(dateNonce);
        const fullHash = hash.digest();
        // Take first 32 bytes for AES-256 key
        return fullHash.slice(0, 32);
    }
    decryptAuthToken(encryptedToken, key) {
        // Decode from base64
        const encryptedData = Buffer.from(encryptedToken, 'base64');
        // Extract nonce (first 12 bytes) and ciphertext with auth tag
        const nonce = encryptedData.slice(0, 12);
        const ciphertext = encryptedData.slice(12, -16);
        const authTag = encryptedData.slice(-16);
        // Create decipher
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAuthTag(authTag);
        // Decrypt
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    }
    /**
     * Get encryption key derived from machine-specific data using proper KDF
     * Uses PBKDF2 with persistent salt for secure key derivation
     */
    async getOrCreateEncryptionKey() {
        const saltFile = path.join(path.dirname(this.cacheFile), '.salt');
        let salt;
        try {
            // Try to read existing salt
            const saltHex = await fs.readFile(saltFile, 'utf-8');
            salt = Buffer.from(saltHex, 'hex');
        }
        catch {
            // Generate new salt on first use
            salt = randomBytes(32);
            await fs.mkdir(path.dirname(saltFile), { recursive: true });
            await fs.writeFile(saltFile, salt.toString('hex'));
            // Set restrictive permissions on salt file
            if (process.platform !== 'win32') {
                await fs.chmod(saltFile, 0o600);
            }
            logger.debug('Generated new encryption salt');
        }
        // Create machine-specific identifier
        const machineId = `${os.hostname()}-${os.userInfo().username}-${process.platform}`;
        // Use PBKDF2 with 100,000 iterations (NIST recommendation for 2025)
        const key = pbkdf2Sync(machineId, salt, 100000, 32, 'sha256');
        return key.toString('hex').substring(0, 32);
    }
    /**
     * Try to use keytar (OS keychain) if available, otherwise fall back to encrypted file
     */
    async loadCachedCredentials() {
        // Try keytar first (if available)
        const keytarLoaded = await this.tryLoadFromKeytar();
        if (keytarLoaded) {
            logger.debug('Loaded credentials from OS keychain');
            return;
        }
        // Fall back to encrypted file
        try {
            const encryptedData = await fs.readFile(this.cacheFile, 'utf-8');
            const encryptionKey = await this.getOrCreateEncryptionKey();
            const decrypted = CryptoJS.AES.decrypt(encryptedData, encryptionKey).toString(CryptoJS.enc.Utf8);
            this.credentials = JSON.parse(decrypted);
            logger.debug('Loaded encrypted credentials from file');
        }
        catch (error) {
            // No cached credentials or decryption failed
            logger.debug('No cached credentials found');
        }
    }
    async saveCachedCredentials() {
        if (!this.credentials)
            return;
        // Try keytar first (if available)
        const keytarSaved = await this.trySaveToKeytar();
        if (keytarSaved) {
            logger.debug('Saved credentials to OS keychain');
            return;
        }
        // Fall back to encrypted file
        try {
            await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
            const credentialsJson = JSON.stringify(this.credentials);
            const encryptionKey = await this.getOrCreateEncryptionKey();
            const encrypted = CryptoJS.AES.encrypt(credentialsJson, encryptionKey).toString();
            await fs.writeFile(this.cacheFile, encrypted);
            // Set file permissions to user-only (Unix systems)
            if (process.platform !== 'win32') {
                await fs.chmod(this.cacheFile, 0o600);
            }
            logger.debug('Saved encrypted credentials to file');
        }
        catch (error) {
            logger.warn('Failed to save credentials to cache:', error);
        }
    }
    /**
     * Try to load credentials from OS keychain using keytar (optional dependency)
     */
    async tryLoadFromKeytar() {
        try {
            // Dynamic import - won't fail if keytar is not installed
            const keytar = await import('keytar');
            const service = 'jaumemory-mcp';
            const account = 'default';
            const password = await keytar.getPassword(service, account);
            if (password) {
                this.credentials = JSON.parse(password);
                return true;
            }
        }
        catch (error) {
            // keytar not available or failed to load
            logger.debug('Keytar not available, using file-based storage');
        }
        return false;
    }
    /**
     * Try to save credentials to OS keychain using keytar (optional dependency)
     */
    async trySaveToKeytar() {
        if (!this.credentials)
            return false;
        try {
            // Dynamic import - won't fail if keytar is not installed
            const keytar = await import('keytar');
            const service = 'jaumemory-mcp';
            const account = 'default';
            await keytar.setPassword(service, account, JSON.stringify(this.credentials));
            return true;
        }
        catch (error) {
            // keytar not available or failed to save
            logger.debug('Keytar not available, using file-based storage');
        }
        return false;
    }
    async clearSession() {
        // Clear cached credentials on logout
        this.credentials = undefined;
        // Try to delete from keytar first
        try {
            const keytar = await import('keytar');
            const service = 'jaumemory-mcp';
            const account = 'default';
            await keytar.deletePassword(service, account);
            logger.debug('Cleared credentials from OS keychain');
        }
        catch (error) {
            // keytar not available
        }
        // Delete the cache file
        try {
            await fs.unlink(this.cacheFile);
            logger.debug('Cleared cached credentials file');
        }
        catch (error) {
            // File might not exist
        }
    }
    async cleanup() {
        // Save credentials before shutdown
        await this.saveCachedCredentials();
    }
    async promptForAuthToken() {
        // Since MCP servers run in non-interactive mode, we need to get the token
        // from environment variable if running in automated mode
        if (process.env.JAUMEMORY_AUTH_TOKEN_MANUAL) {
            return process.env.JAUMEMORY_AUTH_TOKEN_MANUAL;
        }
        // In interactive mode, we would use readline or similar
        // For now, throw an error instructing how to provide the token
        throw new Error('Please set JAUMEMORY_AUTH_TOKEN_MANUAL environment variable with the auth token from your browser.\n' +
            'Then restart the MCP server to complete authentication.');
    }
}
//# sourceMappingURL=AuthManager.js.map