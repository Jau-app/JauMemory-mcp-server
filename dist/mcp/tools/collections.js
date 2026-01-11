/**
 * Collection Management Tools
 *
 * Tools for creating and managing memory collections
 */
import { logger } from '../../utils/logger.js';
export function createCollectionTool(clients) {
    return {
        name: 'create_collection',
        description: 'Create a new collection for organizing memories.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the collection'
                },
                description: {
                    type: 'string',
                    description: 'Description of the collection (optional)'
                },
                memory_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Initial memory IDs to add to the collection (optional)'
                }
            },
            required: ['name']
        },
        handler: async (args) => {
            try {
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                const response = await clients.collections.createCollection({
                    name: args.name,
                    description: args.description,
                    memoryIds: args.memory_ids
                });
                return [
                    {
                        type: 'text',
                        text: `Collection created successfully!
ID: ${response.id}
Name: ${args.name}
${args.description ? `Description: ${args.description}` : ''}`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to create collection:', error);
                throw error;
            }
        }
    };
}
export function listCollectionsTool(clients) {
    return {
        name: 'list_collections',
        description: 'List all your collections.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        },
        handler: async () => {
            try {
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                const response = await clients.collections.listCollections();
                if (!response.collections || response.collections.length === 0) {
                    return [
                        {
                            type: 'text',
                            text: 'No collections found. Create one with create_collection!'
                        }
                    ];
                }
                const collectionsText = response.collections.map((col) => `[${col.id}] ${col.name}${col.description ? ` - ${col.description}` : ''} (${col.memoryCount || 0} memories)`).join('\n');
                return [
                    {
                        type: 'text',
                        text: `Your Collections:\n\n${collectionsText}`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to list collections:', error);
                throw error;
            }
        }
    };
}
export function addToCollectionTool(clients) {
    return {
        name: 'add_to_collection',
        description: 'Add a memory to a collection.',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: {
                    type: 'string',
                    description: 'UUID of the collection',
                    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                },
                memory_id: {
                    type: 'string',
                    description: 'ID of the memory to add'
                }
            },
            required: ['collection_id', 'memory_id']
        },
        handler: async (args) => {
            try {
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                await clients.collections.addMemoryToCollection(args.collection_id, args.memory_id);
                return [
                    {
                        type: 'text',
                        text: `Memory ${args.memory_id} added to collection ${args.collection_id} successfully!`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to add to collection:', error);
                throw error;
            }
        }
    };
}
export function getCollectionTool(clients) {
    return {
        name: 'get_collection',
        description: 'Get details of a specific collection including all its memories.',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: {
                    type: 'string',
                    description: 'UUID of the collection',
                    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                }
            },
            required: ['collection_id']
        },
        handler: async (args) => {
            try {
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                const response = await clients.collections.getCollection(args.collection_id);
                const memoriesText = response.memories?.map((mem) => `  [${mem.id}] ${mem.content.substring(0, 100)}...`).join('\n') || '  No memories in this collection';
                return [
                    {
                        type: 'text',
                        text: `Collection: ${response.name}
ID: ${response.id}
${response.description ? `Description: ${response.description}` : ''}
Created: ${response.createdAt ? new Date(response.createdAt).toLocaleString() : 'Unknown'}
Memory Count: ${response.memoryCount || 0}

Memories:
${memoriesText}`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to get collection:', error);
                throw error;
            }
        }
    };
}
export function removeFromCollectionTool(clients) {
    return {
        name: 'remove_from_collection',
        description: 'Remove a memory from a collection.',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: {
                    type: 'string',
                    description: 'UUID of the collection',
                    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                },
                memory_id: {
                    type: 'string',
                    description: 'UUID of the memory to remove',
                    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                }
            },
            required: ['collection_id', 'memory_id']
        },
        handler: async (args) => {
            try {
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                await clients.collections.removeMemoryFromCollection(args.collection_id, args.memory_id);
                return [
                    {
                        type: 'text',
                        text: `Memory ${args.memory_id} removed from collection ${args.collection_id} successfully!`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to remove from collection:', error);
                throw error;
            }
        }
    };
}
export function updateCollectionTool(clients) {
    return {
        name: 'update_collection',
        description: 'Update collection details (name and/or description).',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: {
                    type: 'string',
                    description: 'UUID of the collection',
                    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                },
                name: {
                    type: 'string',
                    description: 'New name for the collection (optional)',
                    maxLength: 100
                },
                description: {
                    type: 'string',
                    description: 'New description for the collection (optional)',
                    maxLength: 500
                }
            },
            required: ['collection_id']
        },
        handler: async (args) => {
            try {
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                if (!args.name && !args.description) {
                    throw new Error('At least one of name or description must be provided');
                }
                const response = await clients.collections.updateCollection(args.collection_id, { name: args.name, description: args.description });
                return [
                    {
                        type: 'text',
                        text: `Collection updated successfully!
ID: ${response.id}
Name: ${response.name}
${response.description ? `Description: ${response.description}` : ''}`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to update collection:', error);
                throw error;
            }
        }
    };
}
export function deleteCollectionTool(clients) {
    return {
        name: 'delete_collection',
        description: 'Delete a collection (memories are not deleted, only the collection).',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: {
                    type: 'string',
                    description: 'UUID of the collection to delete',
                    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                }
            },
            required: ['collection_id']
        },
        handler: async (args) => {
            try {
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                await clients.collections.deleteCollection(args.collection_id);
                return [
                    {
                        type: 'text',
                        text: `Collection ${args.collection_id} deleted successfully. Memories remain intact.`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to delete collection:', error);
                throw error;
            }
        }
    };
}
export function consolidateCollectionTool(clients) {
    return {
        name: 'consolidate_collection',
        description: 'Consolidate all memories in a collection into a comprehensive summary or insight.',
        inputSchema: {
            type: 'object',
            properties: {
                collection_id: {
                    type: 'string',
                    description: 'UUID of the collection to consolidate',
                    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                },
                summarize_only: {
                    type: 'boolean',
                    description: 'Only create a summary without modifying the collection (default: false)'
                },
                title: {
                    type: 'string',
                    description: 'Title for the consolidated memory (optional)'
                }
            },
            required: ['collection_id']
        },
        handler: async (args) => {
            try {
                const userId = await clients.auth.getCurrentUserId();
                if (!userId) {
                    throw new Error('User authentication required. Please use mcp_login first.');
                }
                const response = await clients.collections.consolidateCollection(args.collection_id, { summarizeOnly: args.summarize_only, title: args.title });
                return [
                    {
                        type: 'text',
                        text: `Collection consolidated successfully!
${response.memoryId ? `New consolidated memory created with ID: ${response.memoryId}` : ''}
${response.summary ? `Summary:\n${response.summary}` : ''}
Memories consolidated: ${response.memoriesConsolidated || 0}
${response.message ? `Message: ${response.message}` : ''}`
                    }
                ];
            }
            catch (error) {
                logger.error('Failed to consolidate collection:', error);
                throw error;
            }
        }
    };
}
//# sourceMappingURL=collections.js.map