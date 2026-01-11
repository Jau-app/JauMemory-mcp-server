/**
 * MCP Resources
 */
export function setupResources(clients) {
    return {
        status: {
            uri: 'jaumemory://status',
            name: 'System Status',
            description: 'Current system status and configuration',
            mimeType: 'application/json',
            handler: async () => {
                const userId = await clients.auth.getCurrentUserId();
                return {
                    status: 'connected',
                    userId,
                    service: 'JauMemory Production',
                    version: '1.0.0'
                };
            }
        }
    };
}
//# sourceMappingURL=index.js.map