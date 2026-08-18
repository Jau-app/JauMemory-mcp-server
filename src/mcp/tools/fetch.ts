/**
 * Fetch Tool - Required by ChatGPT OAuth MCP specification
 *
 * Returns full documentation for specific JauMemory tools by ID.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';

interface Document {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata?: Record<string, any>;
}

export function fetch(_clients: BackendClients): Tool {
  return {
    name: 'fetch',
    description: 'Discovery-only. Returns route documentation for a tool by name. Does NOT look up memory by UUID. Use `recall` (via tools/call) for memory access after completing mcpLogin + mcpAuthenticate.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Tool ID to fetch documentation for'
        }
      },
      required: ['id']
    },
    handler: async (args: { id: string }) => {
      const { id } = args;

      // Discovery-only contract — see plan v14, Fix 2 / Rust handlers.rs
      // build_fetch_discovery_response. fetch is for tool/route catalogs,
      // never memory content. Unknown IDs return the stable
      // `tool_directory` descriptor — DO NOT echo the input id back, and
      // DO NOT throw (clients shouldn't have to handle a -32603 just
      // because they probed an unfamiliar tool name).
      const document = getDocumentById(id) ?? {
        id: "tool_directory",
        title: "JauMemory MCP Server - Discovery Tools",
        text: "search and fetch are discovery tools. To access memory content, use `recall` (under tools/call) after completing mcpLogin and mcpAuthenticate.",
        url: "https://mem.jau.app/mcp/tools",
        metadata: { source: "jaumemory", type: "tool_directory" }
      };

      // Return as array — index.ts wraps in { content: [...] }
      return [
        {
          type: "text",
          text: JSON.stringify(document)
        }
      ];
    }
  };
}

function getDocumentById(id: string): Document | null {
  const docs: Record<string, Document> = {
    // Agent-onboarding docs (public, no auth required)
    "get_guide": {
      id: "get_guide",
      title: "get_guide - Fetch Agent-Onboarding Docs",
      text: `Fetch JauMemory usage documentation over the public /v1/help/* HTTP route. No authentication required — same posture as search and fetch.

Call shapes (pass exactly ONE of topic / persona / search, or none for the index):
- get_guide()                         → topic index (every doc summary)
- get_guide({ topic: "<slug>" })      → specific topic body (e.g. "concepts/shortcuts", "tools/memory/remember", "workflows/debugging-loop")
- get_guide({ persona: "<name>" })    → copy-pasteable system-prompt chunk; name is one of: coding-assistant | personal-memory | cross-platform-context | app-backbone
- get_guide({ search: "<query>" })    → matching topic summaries (substring/keyword)

Multi-arg requests are rejected with a clear error rather than silently picking one.

Common starting points:
- get_guide({ topic: "index" })  ← table of contents
- get_guide({ persona: "coding-assistant" })  ← system-prompt chunk for Claude Code users
- get_guide({ topic: "concepts/shortcuts" })  ← full shortcut flag list
- get_guide({ topic: "concepts/multi-agent-collab" })  ← multi-session coordination

Use this when: you don't know how a JauMemory tool works, you want to coordinate with another agent across sessions, or the user asks "how do I…".`,
      url: "/api/v1/mcp/tools#get_guide",
      metadata: { category: "discovery", required_params: [] }
    },

    // Authentication tools
    "mcp_login": {
      id: "mcp_login",
      title: "mcp_login - Initiate MCP Authentication",
      text: `Initiates the MCP authentication flow with JauMemory.

Parameters:
- username (required): Your JauMemory username
- email (required): Your registered email address

Usage:
mcp_login({ username: "your_username", email: "your@email.com" })

Returns:
- Approval URL to complete authentication in browser
- Request ID for subsequent authentication steps

This is the first step in the MCP authentication process. After calling this, you must visit the approval URL in a browser and complete the authentication, then call mcp_authenticate with the provided token.`,
      url: "/api/v1/mcp/tools#mcp_login",
      metadata: { category: "authentication", required_params: ["username", "email"] }
    },

    "mcp_authenticate": {
      id: "mcp_authenticate",
      title: "mcp_authenticate - Complete MCP Authentication",
      text: `Completes the MCP authentication flow using the token from browser approval.

Parameters:
- auth_token (required): The authentication token from the approval page
- request_id (required): The request ID from mcp_login response

Usage:
mcp_authenticate({ auth_token: "your-auth-token", request_id: "your-request-id" })

Returns:
- Success confirmation
- Transit decryption key for secure communication

This is the second step in MCP authentication. Call this after completing browser approval from mcp_login.`,
      url: "/api/v1/mcp/tools#mcp_authenticate",
      metadata: { category: "authentication", required_params: ["auth_token", "request_id"] }
    },

    "mcp_logout": {
      id: "mcp_logout",
      title: "mcp_logout - End MCP Session",
      text: `Logs out and revokes the current MCP session.

Parameters: None

Usage:
mcp_logout()

Returns:
- Logout confirmation
- Session termination status

This ends the current MCP session and revokes authentication tokens.`,
      url: "/api/v1/mcp/tools#mcp_logout",
      metadata: { category: "authentication", required_params: [] }
    },

    // Memory tools
    "remember": {
      id: "remember",
      title: "remember - Store New Memory",
      text: `Stores a new memory with automatic classification and importance scoring.

Parameters:
- content (required): The memory content to store
- shortcuts (optional): Array of shortcut flags (e.g., ["--task", "--high", "--assign @agent"])
- tags (optional): Array of tags for categorization
- importance (optional): Importance score 0-1
- context (optional): Additional context information
- metadata (optional): Additional metadata object

Usage:
remember({
  content: "Fixed authentication bug in user login",
  shortcuts: ["--bug", "--high", "--project webapp"]
})

Available shortcuts (pure normalization — no notifications fire; assignments are queryable metadata):
- Types: --todo, --task, --bug, --question, --note, --reflection (each appended to tags)
- Status: --pending, --wip, --done, --blocked [reason] (set metadata.status; --blocked also sets metadata.blocked_reason)
- Priority: --low, --medium, --high, --urgent (set metadata.priority — NOT appended to tags)
- Agents: --assign @agent-name (appended to metadata.assigned_to[]), --notify @a,@b (appended to metadata.notify_list[])
- Project / Repo: --project name, --repo url

For the full shortcut spec + examples, call get_guide({ topic: "concepts/shortcuts" }).

Returns:
- Memory ID
- Automatic classification (error, solution, insight, question)
- Importance score and learning value`,
      url: "/api/v1/mcp/tools#remember",
      metadata: { category: "memory", required_params: ["content"] }
    },

    "recall": {
      id: "recall",
      title: "recall - Search Memories",
      text: `Searches and retrieves memories using keyword or semantic similarity.

Parameters:
- query (optional): Search query. Omit for a filters-only search (at
  least one of tags / minImportance / timeRange must then be given).
- limit (optional): Maximum results to return (default: 10; clamped to 100 on the "recent" special-verb path)
- mode (optional): Search mode - "keyword", "semantic", or "hybrid". **No default** — omit to let the classifier route by query shape. Setting mode with query="recent" bypasses the recent special-case (sends through normal keyword/semantic search instead).
- tags (optional): Filter to memories carrying ANY of these tags
- minImportance (optional): Only memories with importance >= this value
- timeRange (optional): { start, end } creation window

Usage:
recall({ query: "authentication bug", limit: 5, tags: ["webapp"] })

Special query: "recent" (exactly that word, with mode omitted)
returns the newest memories. It is the ONLY special query — "today",
"yesterday", "this week" etc. are ordinary search text; use timeRange
for date windows.

Returns:
- Array of matching memories with scores
- Memory content, tags, importance, and metadata
- Agent assignments and project information`,
      url: "/api/v1/mcp/tools#recall",
      metadata: { category: "memory", required_params: [] }
    },

    "update": {
      id: "update",
      title: "update - Update Existing Memory",
      text: `Updates an existing memory's content, metadata, status, or assignment.

Parameters:
- memoryId (required): The ID of the memory to update
- content (optional): New content (replaces existing)
- context (optional): New context (replaces existing)
- importance (optional): New importance (0-1)
- tags (optional): Tags to ADD to the memory. Strictly additive in v1 — unioned with the existing tag set. Cannot remove a tag through this field; that's v2 territory.
- metadata (optional): Explicit metadata patch. Deep-merges into existing metadata LAST (after shortcuts), so e.g. { "assigned_to": [] } clears an existing assignment array.
- shortcuts (optional): Shortcut flags — additive. No shortcut ever CLEARS existing values; only the explicit metadata field can clear/replace.

Merge order on update (v1):
  1. Existing tags + metadata loaded from the row
  2. Tags = existing ∪ explicit \`tags\` (if provided) — additive only; proto3 \`repeated string\` cannot distinguish "absent" from "[]" on the wire, so a "replace tags" semantic isn't expressible without an out-of-band discriminator. To remove a tag, delete + recreate, or wait for v2.
  3. Shortcuts apply (additive on top of base)
  4. Explicit \`metadata\` deep-merges LAST — final wins (the only knob that can clear array metadata fields like \`assigned_to: []\`)

Usage:
update({
  memoryId: "mem-123-456",
  shortcuts: ["--done", "--assign @reviewer-007"],
  context: "Bug fixed and deployed"
})

For the full shortcut spec, call get_guide({ topic: "concepts/shortcuts" }). For workflow examples, call get_guide({ topic: "concepts/multi-agent-collab" }).

Returns:
- Update confirmation
- Updated memory details`,
      url: "/api/v1/mcp/tools#update",
      metadata: { category: "memory", required_params: ["memoryId"] }
    },

    "forget": {
      id: "forget",
      title: "forget - Delete Memory",
      text: `Permanently deletes a specific memory from the system.

Parameters:
- memoryId (required): The ID of the memory to delete

Usage:
forget({ memoryId: "mem-123-456" })

Returns:
- Deletion confirmation
- Memory ID that was removed

Warning: This action is permanent and cannot be undone.`,
      url: "/api/v1/mcp/tools#forget",
      metadata: { category: "memory", required_params: ["memoryId"] }
    },

    "analyze": {
      id: "analyze",
      title: "analyze - Analyze Memory Patterns",
      text: `Analyzes memory patterns and extracts insights.

Parameters:
- timeRange (optional): "day", "week", "month", or "all" (default: "all")
- category (optional): Specific category to analyze

Usage:
analyze({ timeRange: "week" })

Returns:
- Memory type distribution
- Pattern analysis
- Learning progression metrics
- Quality indicators
- Keyword frequency analysis`,
      url: "/api/v1/mcp/tools#analyze",
      metadata: { category: "analytics", required_params: [] }
    },

    "consolidate": {
      id: "consolidate",
      title: "consolidate - Merge Similar Memories (not available yet)",
      text: `NOT AVAILABLE YET: standalone consolidation is not implemented
server-side — every call returns a clean error pointing to
consolidate_collection, which summarizes one collection's memories
for real.

Parameters (accepted by the client, currently rejected by the server):
- similarity_threshold (optional): Minimum similarity 0-1 (default: 0.7)
- min_group_size (optional): Minimum memories to form group (default: 2)
- archive_originals (optional): Archive original memories (default: true)
- dry_run (optional): Preview without making changes (default: false)

Usage:
consolidate_collection({ collection_id: "coll-uuid", title: "Sprint recap" })

Returns:
- Currently: an error explaining standalone consolidation is not
  available and pointing to consolidate_collection`,
      url: "/api/v1/mcp/tools#consolidate",
      metadata: { category: "analytics", required_params: [] }
    },

    "memory_stats": {
      id: "memory_stats",
      title: "memory_stats - Get Memory Statistics",
      text: `Gets detailed statistics about memories with optional filtering.

Parameters:
- query (optional): Search query with wildcard support
- tags (optional): Filter by specific tags
- timeRange (optional): Date range object with start/end dates
- minImportance (optional): Minimum importance threshold 0-1

Usage:
memory_stats({
  query: "bug*",
  minImportance: 0.5,
  timeRange: { start: "2025-01-01", end: "2025-01-31" }
})

Returns:
- Total memory count
- Memory type distribution
- Top tags with counts
- Importance distribution
- Keyword frequency analysis`,
      url: "/api/v1/mcp/tools#memory_stats",
      metadata: { category: "analytics", required_params: [] }
    },

    // Agent tools
    "create_agent": {
      id: "create_agent", title: "create_agent - Create New Agent",
      text: `Create a new agent with personality traits and specializations.\n\nParameters:\n- name (required): Agent name\n- personalityTraits (optional): Array of traits like "analytical", "creative"\n- specializations (optional): Array of expertise areas\n- updatePrompts (optional): Custom prompts for agent behavior\n- initialLearningRate (optional): Learning rate 0-1 (default: 0.5)\n\nUsage:\ncreate_agent({ name: "Code Reviewer", personalityTraits: ["detail-oriented"], specializations: ["React", "TypeScript"] })\n\nReturns: Agent ID, status, and configuration`,
      url: "/api/v1/mcp/tools#create_agent", metadata: { category: "agents", required_params: ["name"] }
    },
    "list_agents": {
      id: "list_agents", title: "list_agents - List All Agents",
      text: `List all available agents with their details.\n\nParameters:\n- status (optional): Filter by "active", "learning", "error", or "archived"\n\nUsage:\nlist_agents({ status: "active" })\n\nReturns: Array of agents with ID, name, personality, specializations, and status`,
      url: "/api/v1/mcp/tools#list_agents", metadata: { category: "agents", required_params: [] }
    },
    "agent_memory": {
      id: "agent_memory", title: "agent_memory - Agent Memory Management",
      text: `Link memories to agents or recall agent-specific memories.\n\nParameters:\n- action (required): "link" or "recall"\n- agentId (required): Agent ID\n- memoryId (optional): Memory ID (for link action)\n- category (optional): Memory category (task, learning, error, solution, reflection)\n- query (optional): Search query (for recall)\n- limit (optional): Max results (for recall)\n- projectContext (optional): Project name filter\n\nUsage:\nagent_memory({ action: "link", agentId: "agent-123", memoryId: "mem-456", category: "task" })\nagent_memory({ action: "recall", agentId: "agent-123", query: "auth bugs" })\n\nReturns: Link confirmation or array of agent memories`,
      url: "/api/v1/mcp/tools#agent_memory", metadata: { category: "agents", required_params: ["action", "agentId"] }
    },
    "agent_error_learning": {
      id: "agent_error_learning", title: "agent_error_learning - Error Learning Protocol",
      text: `Enable agents to learn from errors using a 2-strike protocol.\n\nParameters:\n- action (required): "report", "solve", or "fail"\n- agentId (required): Agent ID\n- errorSignature (optional): Unique error identifier (for report)\n- errorMessage (optional): Error description (for report)\n- contextSnapshot (optional): Code/context where error occurred\n- attemptedSolution (optional): What was tried\n- patternId (optional): Error pattern ID (for solve/fail)\n- solution (optional): Working solution (for solve)\n- verificationSteps (optional): How to verify the fix\n\nUsage:\nagent_error_learning({ action: "report", agentId: "agent-123", errorSignature: "TypeError: x is undefined", errorMessage: "Null reference in auth flow" })\n\nReturns: Pattern ID (new error) or solution status`,
      url: "/api/v1/mcp/tools#agent_error_learning", metadata: { category: "agents", required_params: ["action", "agentId"] }
    },
    "agent_reflection": {
      id: "agent_reflection", title: "agent_reflection - Agent Reflections",
      text: `Create and retrieve agent reflections for continuous improvement.\n\nParameters:\n- action (required): "create" or "list"\n- agentId (required): Agent ID\n- reflectionType (optional): "learning", "mistake", "success", or "collaboration"\n- content (optional): Reflection content (for create)\n- lessonsLearned (optional): Array of key takeaways\n- relatedAgents (optional): Other agents involved\n\nUsage:\nagent_reflection({ action: "create", agentId: "agent-123", reflectionType: "learning", content: "Discovered better approach for caching", lessonsLearned: ["Cache invalidation is key"] })\n\nReturns: Reflection confirmation or list of reflections`,
      url: "/api/v1/mcp/tools#agent_reflection", metadata: { category: "agents", required_params: ["action", "agentId"] }
    },
    "update_agent_name": {
      id: "update_agent_name", title: "update_agent_name - Rename Agent",
      text: `Update an agent's name using the naming convention.\n\nParameters:\n- agentId (required): Agent ID to update\n- newName (required): New name in format "Long Name:shortname"\n\nUsage:\nupdate_agent_name({ agentId: "agent-123", newName: "Frontend Expert:fe1" })\n\nReturns: Update confirmation with new name`,
      url: "/api/v1/mcp/tools#update_agent_name", metadata: { category: "agents", required_params: ["agentId", "newName"] }
    },
    "agent_collaboration": {
      id: "agent_collaboration", title: "agent_collaboration - Agent Collaboration",
      text: `Manage collaboration between agents.\n\nParameters:\n- action (required): "start", "complete", or "list"\n- agentId (required): Initiator agent ID\n- collaboratorId (optional): Partner agent ID (for start)\n- collaborationType (optional): Type like "code-review", "debugging", "testing"\n- collaborationId (optional): Collaboration ID (for complete)\n- outcome (optional): "success", "partial", or "failed" (for complete)\n- memoryId (optional): Related memory ID\n\nUsage:\nagent_collaboration({ action: "start", agentId: "fe1", collaboratorId: "be1", collaborationType: "api-integration" })\n\nReturns: Collaboration ID and status`,
      url: "/api/v1/mcp/tools#agent_collaboration", metadata: { category: "agents", required_params: ["action", "agentId"] }
    },

    // Collection tools
    "create_collection": {
      id: "create_collection", title: "create_collection - Create Collection",
      text: `Create a new collection for organizing memories.\n\nParameters:\n- name (required): Collection name\n- description (optional): Collection description\n- memory_ids (optional): Array of memory IDs to add initially\n\nUsage:\ncreate_collection({ name: "Auth Sprint", description: "Authentication-related memories" })\n\nReturns: Collection ID, name, and description`,
      url: "/api/v1/mcp/tools#create_collection", metadata: { category: "collections", required_params: ["name"] }
    },
    "list_collections": {
      id: "list_collections", title: "list_collections - List Collections",
      text: `List all your collections.\n\nParameters: None\n\nUsage:\nlist_collections()\n\nReturns: Array of collections with ID, name, description, and memory count`,
      url: "/api/v1/mcp/tools#list_collections", metadata: { category: "collections", required_params: [] }
    },
    "get_collection": {
      id: "get_collection", title: "get_collection - Get Collection Details",
      text: `Get details of a specific collection including all its memories.\n\nParameters:\n- collection_id (required): UUID of the collection\n\nUsage:\nget_collection({ collection_id: "uuid-here" })\n\nReturns: Collection details with all contained memories`,
      url: "/api/v1/mcp/tools#get_collection", metadata: { category: "collections", required_params: ["collection_id"] }
    },
    "add_to_collection": {
      id: "add_to_collection", title: "add_to_collection - Add Memory to Collection",
      text: `Add a memory to a collection.\n\nParameters:\n- collection_id (required): UUID of the collection\n- memory_id (required): ID of the memory to add\n\nUsage:\nadd_to_collection({ collection_id: "coll-uuid", memory_id: "mem-uuid" })\n\nReturns: Success confirmation`,
      url: "/api/v1/mcp/tools#add_to_collection", metadata: { category: "collections", required_params: ["collection_id", "memory_id"] }
    },
    "remove_from_collection": {
      id: "remove_from_collection", title: "remove_from_collection - Remove Memory from Collection",
      text: `Remove a memory from a collection. The memory itself is not deleted.\n\nParameters:\n- collection_id (required): UUID of the collection\n- memory_id (required): UUID of the memory to remove\n\nUsage:\nremove_from_collection({ collection_id: "coll-uuid", memory_id: "mem-uuid" })\n\nReturns: Success confirmation`,
      url: "/api/v1/mcp/tools#remove_from_collection", metadata: { category: "collections", required_params: ["collection_id", "memory_id"] }
    },
    "update_collection": {
      id: "update_collection", title: "update_collection - Update Collection",
      text: `Update collection name and/or description.\n\nParameters:\n- collection_id (required): UUID of the collection\n- name (optional): New name\n- description (optional): New description\n\nUsage:\nupdate_collection({ collection_id: "coll-uuid", description: "Updated description" })\n\nReturns: Updated collection details`,
      url: "/api/v1/mcp/tools#update_collection", metadata: { category: "collections", required_params: ["collection_id"] }
    },
    "delete_collection": {
      id: "delete_collection", title: "delete_collection - Delete Collection",
      text: `Delete a collection. Memories in the collection are NOT deleted.\n\nParameters:\n- collection_id (required): UUID of the collection to delete\n\nUsage:\ndelete_collection({ collection_id: "coll-uuid" })\n\nReturns: Deletion confirmation`,
      url: "/api/v1/mcp/tools#delete_collection", metadata: { category: "collections", required_params: ["collection_id"] }
    },
    "consolidate_collection": {
      id: "consolidate_collection", title: "consolidate_collection - Consolidate Collection",
      text: `Consolidate all memories in a collection into a comprehensive summary.\n\nALWAYS WRITES: a consolidated memory is created and added to the collection on every call.\n\nParameters:\n- collection_id (required): UUID of the collection\n- title (optional): Title for the consolidated memory\n- summarize_only (optional): Affects the RESPONSE only — true returns just the summary text, false also reports the new memory ID. The memory is written either way (default: false)\n\nUsage:\nconsolidate_collection({ collection_id: "coll-uuid", title: "Sprint Summary" })\n\nReturns: Consolidated memory ID and summary`,
      url: "/api/v1/mcp/tools#consolidate_collection", metadata: { category: "collections", required_params: ["collection_id"] }
    },

    // Vault tools
    "vault_store": {
      id: "vault_store", title: "vault_store - Store Credential",
      text: `Store an API credential securely in the encrypted vault. The secret value is write-only and never returned.\n\nParameters:\n- name (required): Human-readable name\n- credential_type (required): "api_key", "bearer_token", "basic_auth", "oauth2", or "custom_header"\n- value (required): The secret value (write-only, never returned)\n- provider (optional): Provider name like "openai", "stripe" (auto-configures auth headers)\n- description (optional): What this credential is used for\n- auth_header (optional): HTTP header name (default: "Authorization")\n- auth_prefix (optional): Value prefix like "Bearer", "Basic"\n- injection_method (optional): "header", "query", "body", or "url"\n- scopes (optional): Permission labels\n- notes (optional): Private notes\n\nUsage:\nvault_store({ name: "OpenAI Key", credential_type: "bearer_token", value: "sk-...", provider: "openai" })\n\nReturns: Credential ID, slug, masked value`,
      url: "/api/v1/mcp/tools#vault_store", metadata: { category: "vault", required_params: ["name", "credential_type", "value"] }
    },
    "vault_list": {
      id: "vault_list", title: "vault_list - List Credentials",
      text: `List stored credentials. Values are always masked.\n\nParameters:\n- provider (optional): Filter by provider\n- credential_type (optional): Filter by type\n- active_only (optional): Only show active credentials\n\nUsage:\nvault_list({ provider: "openai" })\n\nReturns: Array of credentials with masked values`,
      url: "/api/v1/mcp/tools#vault_list", metadata: { category: "vault", required_params: [] }
    },
    "vault_rotate": {
      id: "vault_rotate", title: "vault_rotate - Rotate Credential",
      text: `Rotate (replace) the secret value of a credential. The old value is permanently replaced.\n\nParameters:\n- credential_id (required): UUID of the credential\n- new_value (required): New secret value (write-only)\n\nUsage:\nvault_rotate({ credential_id: "cred-uuid", new_value: "new-sk-..." })\n\nReturns: Rotation confirmation with new masked value`,
      url: "/api/v1/mcp/tools#vault_rotate", metadata: { category: "vault", required_params: ["credential_id", "new_value"] }
    },

    // Tool registry
    "tool_create": {
      id: "tool_create", title: "tool_create - Register Tool",
      text: `Register an HTTP/API endpoint as a callable tool with optional credential injection.\n\nParameters:\n- name (required): Tool name\n- tool_type (required): "rest", "graphql", "grpc", "webhook", "nomcp", etc.\n- base_url (optional): Base URL for the API\n- description (optional): What the tool does\n- tags (optional): Tags for search\n- credential_id (optional): Vault credential UUID for auto auth injection\n- hosting_provider (optional): "berrry", "vercel", "aws_lambda", "self_hosted", etc.\n- hosting_metadata_json (optional): Provider-specific config\n- endpoints_json (optional): JSON array of endpoint definitions\n\nUsage:\ntool_create({ name: "My API", tool_type: "rest", base_url: "https://api.example.com" })\n\nReturns: Tool ID, slug, and configuration`,
      url: "/api/v1/mcp/tools#tool_create", metadata: { category: "tool_registry", required_params: ["name", "tool_type"] }
    },
    "tool_update": {
      id: "tool_update", title: "tool_update - Update Tool",
      text: `Update a registered tool's configuration.\n\nParameters:\n- tool_id (required): UUID of the tool\n- name, description, base_url, tags, is_active, tool_type (all optional)\n\nUsage:\ntool_update({ tool_id: "tool-uuid", description: "Updated description" })\n\nReturns: Update confirmation`,
      url: "/api/v1/mcp/tools#tool_update", metadata: { category: "tool_registry", required_params: ["tool_id"] }
    },
    "tool_call": {
      id: "tool_call", title: "tool_call - Execute Tool",
      text: `Execute a registered tool by slug. Credentials are automatically injected.\n\nParameters:\n- slug (required): Tool slug\n- method (optional): HTTP method override (GET, POST, etc.)\n- path_suffix (optional): Path appended to base URL\n- request_body (optional): Request body as JSON string\n- query_params (optional): Query parameters as key-value pairs\n- extra_headers (optional): Additional headers (auth headers are denied)\n- endpoint_index (optional): Endpoint index (default: 0)\n\nUsage:\ntool_call({ slug: "my-api", method: "GET", path_suffix: "/users", query_params: { limit: "10" } })\n\nReturns: HTTP status, response body, response time, credential usage flag`,
      url: "/api/v1/mcp/tools#tool_call", metadata: { category: "tool_registry", required_params: ["slug"] }
    },
    "tool_list": {
      id: "tool_list", title: "tool_list - List Tools",
      text: `List registered tools with filtering.\n\nParameters:\n- tool_type (optional): Filter by type\n- search (optional): Full-text search\n- active_only (optional): Only active tools\n- include_public (optional): Include public tools\n- category_id (optional): Filter by category UUID\n\nUsage:\ntool_list({ search: "api", active_only: true })\n\nReturns: Array of tools with details`,
      url: "/api/v1/mcp/tools#tool_list", metadata: { category: "tool_registry", required_params: [] }
    },
    "tool_render": {
      id: "tool_render", title: "tool_render - Render Tool Documentation",
      text: `Render a tool as human-readable markdown documentation. Credentials are redacted.\n\nParameters:\n- tool_id (required): UUID of the tool\n\nUsage:\ntool_render({ tool_id: "tool-uuid" })\n\nReturns: Markdown documentation with endpoints, schemas, and configuration`,
      url: "/api/v1/mcp/tools#tool_render", metadata: { category: "tool_registry", required_params: ["tool_id"] }
    },

    // Skill registry
    "skill_create": {
      id: "skill_create", title: "skill_create - Create Skill Workflow",
      text: `Create a skill workflow that chains multiple tools together.\n\nParameters:\n- name (required): Skill name\n- skill_type (required): "workflow", "converter", "generator", "analyzer", or "connector"\n- description (optional): What the skill does\n- tags (optional): Tags for search\n- trigger_phrases (optional): Natural language activation phrases\n- pipeline_json (optional): JSON array of pipeline steps with tool_slug references\n\nUsage:\nskill_create({ name: "Data Pipeline", skill_type: "workflow", trigger_phrases: ["process data"], pipeline_json: "[{\"id\":\"step_1\",\"type\":\"tool\",\"tool_slug\":\"my-api\"}]" })\n\nReturns: Skill ID, slug, and configuration`,
      url: "/api/v1/mcp/tools#skill_create", metadata: { category: "skill_registry", required_params: ["name", "skill_type"] }
    },
    "skill_list": {
      id: "skill_list", title: "skill_list - List Skills",
      text: `List skill workflows with filtering.\n\nParameters:\n- skill_type (optional): Filter by type\n- search (optional): Full-text search\n- active_only (optional): Only active skills\n- include_public (optional): Include public skills\n- category_id (optional): Filter by category UUID\n\nUsage:\nskill_list({ search: "pipeline" })\n\nReturns: Array of skills with details`,
      url: "/api/v1/mcp/tools#skill_list", metadata: { category: "skill_registry", required_params: [] }
    },
    "skill_render": {
      id: "skill_render", title: "skill_render - Render Skill Documentation",
      text: `Render a skill as human-readable markdown with linked tool documentation.\n\nParameters:\n- skill_id (required): UUID of the skill\n\nUsage:\nskill_render({ skill_id: "skill-uuid" })\n\nReturns: Markdown documentation including all tool steps`,
      url: "/api/v1/mcp/tools#skill_render", metadata: { category: "skill_registry", required_params: ["skill_id"] }
    },

    // Toolkit search and execution
    "toolkit_search": {
      id: "toolkit_search", title: "toolkit_search - Search Tools and Skills",
      text: `Unified search across both tools and skills.\n\nParameters:\n- query (required): Search query (matches name, description, tags)\n- tools_only (optional): Only return tools\n- skills_only (optional): Only return skills\n- category_id (optional): Filter by category UUID\n- limit (optional): Max results (default: 20)\n\nUsage:\ntoolkit_search({ query: "api validation" })\n\nReturns: Combined results from tools and skills with type, slug, and usage count`,
      url: "/api/v1/mcp/tools#toolkit_search", metadata: { category: "toolkit", required_params: ["query"] }
    },
    "skill_execute": {
      id: "skill_execute", title: "skill_execute - Execute Skill",
      text: `Execute a skill workflow by slug. Runs all tool steps with automatic credential injection.\n\nParameters:\n- slug (required): Skill slug\n- input_json (optional): Input data as JSON string\n- step_overrides (optional): Per-step parameter overrides\n- resume_token (optional): Token for resuming paused executions\n- llm_response (optional): LLM response for paused LLM steps\n\nUsage:\nskill_execute({ slug: "data-pipeline", input_json: "{\"url\":\"https://example.com\"}" })\n\nReturns: Execution result with step outputs, duration, and classification`,
      url: "/api/v1/mcp/tools#skill_execute", metadata: { category: "toolkit", required_params: ["slug"] }
    },

    // Berrry integration
    "berrry_register_tool": {
      id: "berrry_register_tool", title: "berrry_register_tool - Register Berrry App",
      text: `Register an existing Berrry app as a JauMemory tool. Verifies the app exists via NOMCP.\n\nParameters:\n- subdomain (required): Berrry app subdomain (e.g. "json-validator")\n- nomcp_credential_id (required): UUID of vault credential with Berrry NOMCP token\n- name (optional): Display name (defaults to subdomain)\n- description (optional): What the tool does\n- tags (optional): Tags for search\n- auth_path (optional): "user" (API key) or "agent" (Ed25519). Default: "user"\n\nUsage:\nberrry_register_tool({ subdomain: "my-app", nomcp_credential_id: "cred-uuid" })\n\nReturns: Tool ID, slug, and app URL`,
      url: "/api/v1/mcp/tools#berrry_register_tool", metadata: { category: "berrry", required_params: ["subdomain", "nomcp_credential_id"] }
    },
    "berrry_create_tool": {
      id: "berrry_create_tool", title: "berrry_create_tool - Create Berrry App and Register",
      text: `Create a new Berrry app AND register it as a JauMemory tool in one step.\n\nParameters:\n- subdomain (required): Subdomain for the new app\n- nomcp_credential_id (required): UUID of vault credential with Berrry NOMCP token\n- name (optional): Display name\n- description (optional): What the app does\n- tags (optional): Tags for search\n- files_json (optional): JSON array of files [{name, content}]\n- remix_from (optional): Subdomain to fork from\n- auth_path (optional): "user" or "agent". Default: "user"\n\nUsage:\nberrry_create_tool({ subdomain: "my-new-app", nomcp_credential_id: "cred-uuid", files_json: "[{\"name\":\"index.html\",\"content\":\"<h1>Hello</h1>\"}]" })\n\nReturns: Tool ID, slug, app URL, and file count`,
      url: "/api/v1/mcp/tools#berrry_create_tool", metadata: { category: "berrry", required_params: ["subdomain", "nomcp_credential_id"] }
    },

    // Skill scheduling
    "skill_schedule": {
      id: "skill_schedule", title: "skill_schedule - Schedule Skill Execution",
      text: `Schedule a skill for recurring cron-based execution.\n\nParameters:\n- skill_id (required): UUID of the skill to schedule\n- cron_expression (required): 6-field cron with seconds (e.g. "0 0 0 * * *" for daily)\n- timezone (optional): Timezone (default: UTC)\n- max_retries (optional): Retry attempts 0-10 (default: 3)\n- retry_delay_seconds (optional): Seconds between retries 10-3600 (default: 60)\n- notify_on_failure (optional): Notify on failure (default: true)\n- notify_on_success (optional): Notify on success (default: false)\n\nUsage:\nskill_schedule({ skill_id: "skill-uuid", cron_expression: "0 */5 * * * *" })\n\nReturns: Schedule ID, next run time, enabled status. Max 20 active schedules per user.`,
      url: "/api/v1/mcp/tools#skill_schedule", metadata: { category: "scheduling", required_params: ["skill_id", "cron_expression"] }
    },
    "skill_schedule_list": {
      id: "skill_schedule_list", title: "skill_schedule_list - List Schedules",
      text: `List scheduled skill runs.\n\nParameters:\n- skill_id (optional): Filter by skill UUID\n- status (optional): Filter by status\n- limit (optional): Max results (default: 20)\n- offset (optional): Pagination offset\n\nUsage:\nskill_schedule_list({ status: "pending" })\n\nReturns: Array of schedules with cron, next run, and status`,
      url: "/api/v1/mcp/tools#skill_schedule_list", metadata: { category: "scheduling", required_params: [] }
    },
    "skill_schedule_cancel": {
      id: "skill_schedule_cancel", title: "skill_schedule_cancel - Cancel Schedule",
      text: `Cancel (soft-delete) a scheduled skill run.\n\nParameters:\n- schedule_id (required): UUID of the schedule to cancel\n\nUsage:\nskill_schedule_cancel({ schedule_id: "sched-uuid" })\n\nReturns: Cancellation confirmation`,
      url: "/api/v1/mcp/tools#skill_schedule_cancel", metadata: { category: "scheduling", required_params: ["schedule_id"] }
    },
    "skill_schedule_retrigger": {
      id: "skill_schedule_retrigger", title: "skill_schedule_retrigger - Re-trigger Schedule",
      text: `Re-trigger a failed or completed scheduled run. Resets retry count.\n\nParameters:\n- schedule_id (required): UUID of the schedule\n\nUsage:\nskill_schedule_retrigger({ schedule_id: "sched-uuid" })\n\nReturns: Retrigger confirmation with next run time`,
      url: "/api/v1/mcp/tools#skill_schedule_retrigger", metadata: { category: "scheduling", required_params: ["schedule_id"] }
    },
    "skill_tasks_pending": {
      id: "skill_tasks_pending", title: "skill_tasks_pending - List Pending Tasks",
      text: `List pending/actionable skill tasks: paused executions and recent failures.\n\nParameters:\n- skill_id (optional): Filter by skill UUID\n- limit (optional): Max results (default: 20)\n\nUsage:\nskill_tasks_pending()\n\nReturns: Array of pending tasks needing attention`,
      url: "/api/v1/mcp/tools#skill_tasks_pending", metadata: { category: "scheduling", required_params: [] }
    },
    "skill_task_retrigger": {
      id: "skill_task_retrigger", title: "skill_task_retrigger - Re-trigger Task",
      text: `Re-trigger a failed task execution.\n\nParameters:\n- schedule_id (required): UUID of the schedule to retrigger\n\nUsage:\nskill_task_retrigger({ schedule_id: "sched-uuid" })\n\nReturns: Retrigger confirmation`,
      url: "/api/v1/mcp/tools#skill_task_retrigger", metadata: { category: "scheduling", required_params: ["schedule_id"] }
    },
    "skill_tasks_list": {
      id: "skill_tasks_list", title: "skill_tasks_list - List Execution Logs",
      text: `List skill execution logs and history.\n\nParameters:\n- skill_id (optional): Filter by skill UUID\n- status (optional): Filter by "running", "completed", "failed", "cancelled", "paused_for_llm"\n- limit (optional): Max results (default: 20)\n- offset (optional): Pagination offset\n\nUsage:\nskill_tasks_list({ status: "failed", limit: 5 })\n\nReturns: Array of execution logs with status, duration, and step results`,
      url: "/api/v1/mcp/tools#skill_tasks_list", metadata: { category: "scheduling", required_params: [] }
    }
  };

  return docs[id] || null;
}