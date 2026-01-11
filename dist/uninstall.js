#!/usr/bin/env node
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import readline from 'readline/promises';
const COLORS = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
};
function log(message, color = 'reset') {
    console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}
async function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await rl.question(`${COLORS.yellow}${question}${COLORS.reset} `);
    rl.close();
    return answer.trim();
}
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function removeIfExists(filePath, description) {
    if (await fileExists(filePath)) {
        try {
            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) {
                await fs.rm(filePath, { recursive: true, force: true });
            }
            else {
                await fs.unlink(filePath);
            }
            log(`  ✓ Removed ${description}`, 'green');
            return true;
        }
        catch (error) {
            log(`  ✗ Failed to remove ${description}: ${error}`, 'red');
            return false;
        }
    }
    else {
        log(`  - ${description} not found (already removed)`, 'yellow');
        return false;
    }
}
async function uninstallJauMemoryMCP() {
    log('\n=================================', 'bold');
    log('JauMemory MCP Client Uninstaller', 'bold');
    log('=================================\n', 'bold');
    log('This will remove:', 'yellow');
    log('  • JauMemory from Claude Desktop configuration');
    log('  • Local authentication tokens');
    log('  • Cached session data');
    log('  • Local configuration files\n');
    log('This will NOT affect:', 'green');
    log('  ✓ Your memories stored on the server');
    log('  ✓ Your JauMemory account');
    log('  ✓ Any server-side data\n');
    const confirmation = await prompt('Remove JauMemory MCP client from this device? (yes/no)');
    if (confirmation.toLowerCase() !== 'yes') {
        log('\nUninstall cancelled.', 'yellow');
        process.exit(0);
    }
    log('\nStarting MCP client removal...', 'blue');
    // 1. Remove from Claude Desktop configuration
    log('\n1. Updating Claude Desktop configuration...', 'blue');
    const claudeConfigPath = path.join(os.homedir(), '.claude', 'claude_desktop_config.json');
    if (await fileExists(claudeConfigPath)) {
        try {
            const configContent = await fs.readFile(claudeConfigPath, 'utf-8');
            const config = JSON.parse(configContent);
            // Remove JauMemory MCP server entries
            let removed = false;
            if (config.mcpServers) {
                // Check for different possible names
                const possibleNames = ['jaumemory', 'jaumemory-pg', 'JauMemory', 'jaumemory-production'];
                for (const name of possibleNames) {
                    if (config.mcpServers[name]) {
                        delete config.mcpServers[name];
                        removed = true;
                        log(`  ✓ Removed '${name}' from Claude Desktop`, 'green');
                    }
                }
                if (removed) {
                    await fs.writeFile(claudeConfigPath, JSON.stringify(config, null, 2));
                }
                else {
                    log('  - JauMemory not found in Claude Desktop config', 'yellow');
                }
            }
        }
        catch (error) {
            log(`  ✗ Failed to update Claude config: ${error}`, 'red');
        }
    }
    else {
        log('  - Claude Desktop config not found', 'yellow');
    }
    // 2. Remove local cache and credentials
    log('\n2. Removing local cache and credentials...', 'blue');
    // Remove cache directories
    const cacheDir = path.join(os.homedir(), '.cache', 'jaumemory');
    await removeIfExists(cacheDir, 'JauMemory cache directory');
    const configDir = path.join(os.homedir(), '.config', 'jaumemory');
    await removeIfExists(configDir, 'JauMemory config directory');
    // Remove any stored tokens or session files
    const dataDir = path.join(os.homedir(), '.local', 'share', 'jaumemory');
    await removeIfExists(dataDir, 'JauMemory data directory');
    // 3. Clear keychain/credential store entries
    log('\n3. Clearing stored credentials...', 'blue');
    // Try to use keytar if available (optional dependency)
    let keytarAvailable = false;
    try {
        // Dynamic import with type assertion to handle optional dependency
        const keytar = await import('keytar').catch(() => null);
        if (keytar) {
            keytarAvailable = true;
            // Remove stored credentials from OS keychain
            const services = ['jaumemory', 'jaumemory-pg', 'jaumemory-production', 'jaumemory-mcp'];
            for (const service of services) {
                try {
                    const creds = await keytar.findCredentials(service);
                    for (const cred of creds) {
                        await keytar.deletePassword(service, cred.account);
                        log(`  ✓ Removed credentials for ${cred.account} from OS keychain`, 'green');
                    }
                }
                catch (err) {
                    // Continue with other services
                }
            }
        }
    }
    catch (error) {
        // Keytar not available - this is fine
    }
    if (!keytarAvailable) {
        log('  - OS keychain not available (using file-based storage)', 'yellow');
    }
    // 4. Clear any temporary files
    log('\n4. Clearing temporary files...', 'blue');
    const tmpDir = path.join(os.tmpdir(), 'jaumemory-mcp');
    await removeIfExists(tmpDir, 'Temporary files');
    // 5. Remove local .env file if exists (for development)
    const projectRoot = path.resolve(__dirname, '..');
    const envFile = path.join(projectRoot, '.env');
    if (await fileExists(envFile)) {
        const removeEnv = await prompt('\nRemove local .env configuration file? (yes/no)');
        if (removeEnv.toLowerCase() === 'yes') {
            await removeIfExists(envFile, 'Local environment configuration');
        }
    }
    log('\n=================================', 'bold');
    log('✓ JauMemory MCP client removed', 'green');
    log('=================================\n', 'bold');
    log('Your memories remain safe on the JauMemory server!', 'green');
    log('\nTo reinstall the MCP client:', 'blue');
    log('  1. Run: npm install && npm run build', 'yellow');
    log('  2. Add JauMemory back to Claude Desktop config', 'yellow');
    log('\nTo permanently delete your account and all data:', 'yellow');
    log('  • Login to the JauMemory web interface', 'yellow');
    log('  • Go to Settings > Account > Delete Account', 'yellow');
    log('  • Or use the API: DELETE /api/v1/account', 'yellow');
    // Create removal record
    const recordPath = path.join(os.tmpdir(), `jaumemory-uninstall-${Date.now()}.txt`);
    const record = `JauMemory MCP Client Removal Record
====================================
Date: ${new Date().toISOString()}
User: ${os.userInfo().username}
System: ${os.platform()} ${os.release()}
Node Version: ${process.version}

Actions Taken:
✓ Removed from Claude Desktop configuration
✓ Cleared local cache and credentials
✓ Removed temporary files
✓ Cleared stored authentication tokens

Your data on the JauMemory server remains intact.

To permanently delete your account:
- Use the web interface account deletion feature
- Or call the API: DELETE /api/v1/account

This provides a 30-day recovery period before permanent deletion.
`;
    await fs.writeFile(recordPath, record);
    log(`\nRemoval record saved to: ${recordPath}`, 'green');
}
// Run the uninstaller
uninstallJauMemoryMCP().catch((error) => {
    log(`\nUninstall failed: ${error}`, 'red');
    process.exit(1);
});
//# sourceMappingURL=uninstall.js.map