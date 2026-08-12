/**
 * get_guide — fetch the agent-onboarding docs over the public no-auth
 * `/v1/help/*` HTTP route. Same posture as the existing `search` and
 * `fetch` discovery tools: no authentication required, safe to call
 * before login.
 *
 * Call shapes (exactly ONE of topic / persona / search, or none):
 *   get_guide()                       → topic index
 *   get_guide({ topic: "..." })       → specific topic
 *   get_guide({ persona: "..." })     → starter system-prompt chunk
 *   get_guide({ search: "..." })      → matching topic summaries
 *
 * Multi-arg requests are rejected with a clear error rather than
 * silently picking one — no surprise precedence.
 */

import { z } from 'zod';
import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';
import { FETCH_DOCS_TIMEOUT_MS } from '../../config/httpPolicy.js';
import { resolveApiUrl } from '../../config/apiUrl.js';

const getGuideSchema = z.object({
  topic: z.string().optional(),
  persona: z.string().optional(),
  search: z.string().optional(),
});

// Hardening 0.5.1 (Fix 2): single validated resolver, no direct env read.
const API_BASE = resolveApiUrl();

export function getGuideTool(_clients: BackendClients): Tool {
  return {
    name: 'get_guide',
    description: [
      'Fetch JauMemory usage docs.',
      'No authentication required — same public posture as search and fetch.',
      'Call with no args to get the topic index; with `topic` (e.g. "concepts/shortcuts", "tools/memory/remember") to get a specific guide; with `persona` ("coding-assistant", "personal-memory", "cross-platform-context", or "app-backbone") to get a copy-pasteable system-prompt chunk; or with `search` to find topics by keyword.',
      'Use this when you don\'t know how a JauMemory tool works, when you want to coordinate with another agent across sessions, or when the user asks "how do I…".',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic slug (e.g. "concepts/shortcuts", "tools/memory/remember"). Use the index call to see all valid slugs.',
        },
        persona: {
          type: 'string',
          description: 'Persona name. One of: coding-assistant | personal-memory | cross-platform-context | app-backbone.',
        },
        search: {
          type: 'string',
          description: 'Keyword search across topic titles + summaries.',
        },
      },
    },
    handler: async (args: unknown) => {
      const input = getGuideSchema.parse(args ?? {});

      // Exactly one of topic/persona/search, or none (index).
      const setArgs = [input.topic, input.persona, input.search].filter(
        (v) => v !== undefined && v !== ''
      );
      if (setArgs.length > 1) {
        throw new Error(
          'get_guide: pass exactly one of { topic, persona, search } — or none for the topic index.'
        );
      }

      let url: string;
      if (input.topic) {
        url = `${API_BASE}/v1/help/topic/${encodeSlug(input.topic)}`;
      } else if (input.persona) {
        url = `${API_BASE}/v1/help/persona/${encodeURIComponent(input.persona)}`;
      } else if (input.search) {
        url = `${API_BASE}/v1/help/search?q=${encodeURIComponent(input.search)}`;
      } else {
        url = `${API_BASE}/v1/help`;
      }

      logger.info('get_guide fetching docs', { url });

      let response: Response;
      // Hardening 0.5.1 (Fix 1, B3-audit): bound the native fetch — it
      // previously had no abort/timeout at all.
      const abort = new AbortController();
      const abortTimer = setTimeout(() => abort.abort(), FETCH_DOCS_TIMEOUT_MS);
      try {
        response = await fetch(url, { signal: abort.signal });
      } catch (e) {
        if (abort.signal.aborted) {
          throw new Error(`get_guide: timed out after ${FETCH_DOCS_TIMEOUT_MS} ms fetching ${url}`);
        }
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`get_guide: network error fetching ${url}: ${msg}`);
      } finally {
        clearTimeout(abortTimer);
      }

      if (response.status === 404) {
        const slug = input.topic || input.persona || input.search || '(index)';
        throw new Error(`get_guide: no docs found for "${slug}"`);
      }
      if (!response.ok) {
        throw new Error(
          `get_guide: HTTP ${response.status} fetching ${url}`
        );
      }

      // The route returns JSON. Pass the response body through verbatim
      // so the agent gets the same shape (slug, title, summary, markdown,
      // related, mcp_tools) the route documents.
      const body = await response.text();

      return [
        {
          type: 'text',
          text: body,
        },
      ];
    },
  };
}

/**
 * Slug-encode: encodeURIComponent escapes `/`, but the route's
 * wildcard expects path-style slugs (`tools/memory/remember`). Replace
 * `%2F` back with `/` after the encode.
 */
function encodeSlug(slug: string): string {
  return encodeURIComponent(slug).replace(/%2F/gi, '/');
}
