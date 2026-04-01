/**
 * Toolkit Search & Skill Execution Tools
 *
 * MCP tools for unified search across tools and skills,
 * and for executing skill workflows end-to-end.
 */

import type { Tool } from './index.js';
import type { BackendClients } from '../../types/clients.js';
import { logger } from '../../utils/logger.js';
import { redactSecrets } from '../../utils/redaction.js';

export function toolkitSearchTool(clients: BackendClients): Tool {
  return {
    name: 'toolkit_search',
    description: 'Search across both tools and skills in a unified query. Results include name, slug, type, category, and usage count.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (matches name, description, tags)'
        },
        category_id: {
          type: 'string',
          description: 'Filter results to a specific category UUID'
        },
        tools_only: {
          type: 'boolean',
          description: 'Only return tool results (default: false)'
        },
        skills_only: {
          type: 'boolean',
          description: 'Only return skill results (default: false)'
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 20)'
        }
      },
      required: ['query']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        const response = await clients.skills.searchToolkit({
          query: args.query,
          limit: args.limit,
          category_id: args.category_id,
          tools_only: args.tools_only,
          skills_only: args.skills_only
        });

        if (!response.results || response.results.length === 0) {
          return [
            {
              type: 'text',
              text: `No results found for "${args.query}". Try a broader search term.`
            }
          ];
        }

        const lines = response.results.map((r: any) => {
          const typeLabel = r.result_type === 'tool' ? 'TOOL' : 'SKILL';
          return `[${typeLabel}] ${r.name} (${r.slug})${r.category_name ? ` | ${r.category_name}` : ''}
   ${r.description ? r.description.substring(0, 80) : 'No description'}
   ${r.tags.length > 0 ? `Tags: ${r.tags.join(', ')} | ` : ''}Uses: ${r.usage_count}${r.is_public ? ' | Public' : ''}`;
        }).join('\n\n');

        return [
          {
            type: 'text',
            text: `Search Results for "${args.query}" (${response.total} matches):\n\n${lines}`
          }
        ];
      } catch (error) {
        logger.error('Failed to search toolkit:', error);
        throw error;
      }
    }
  };
}

export function skillExecuteTool(clients: BackendClients): Tool {
  return {
    name: 'skill_execute',
    description: 'Execute a skill workflow by slug. Runs all tool steps in order with automatic credential injection. Sensitive outputs are automatically redacted by the server.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Skill slug (e.g. "summarize-and-translate")'
        },
        input_json: {
          type: 'string',
          description: 'Input data as a JSON string (must match skill input schema if defined)'
        },
        step_overrides: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Per-step parameter overrides as key-value pairs'
        },
        resume_token: {
          type: 'string',
          description: 'Opaque resume token from a paused execution (for LLM step continuation)'
        },
        llm_response: {
          type: 'string',
          description: 'LLM response to provide when resuming a paused execution'
        }
      },
      required: ['slug']
    },
    handler: async (args: any) => {
      try {
        const userId = await clients.auth.getCurrentUserId();
        if (!userId) {
          throw new Error('User authentication required. Please use mcp_login first.');
        }

        logger.debug('skill_execute invoked', { args: redactSecrets(args) });

        const response = await clients.skills.executeSkill({
          slug: args.slug,
          input_json: args.input_json,
          step_overrides: args.step_overrides,
          resume_token: args.resume_token,
          llm_response: args.llm_response
        });

        // Handle paused execution (LLM step waiting for callback)
        if (response.paused) {
          let pauseText = `Skill Execution PAUSED — awaiting LLM response\n`;
          pauseText += `Duration so far: ${response.total_duration_ms}ms\n`;

          if (response.llm_prompt) {
            pauseText += `\nPrompt: ${response.llm_prompt}\n`;
          }
          if (response.llm_context_json) {
            pauseText += `\nContext: ${response.llm_context_json}\n`;
          }
          if (response.llm_options && response.llm_options.length > 0) {
            pauseText += `\nOptions: ${response.llm_options.join(', ')}\n`;
          }

          pauseText += `\nTo resume, call skill_execute with:`;
          pauseText += `\n  slug: "${args.slug}"`;
          pauseText += `\n  resume_token: (use the token below)`;
          pauseText += `\n  llm_response: (your response to the prompt above)`;

          // Build step results for completed steps so far
          if (response.step_results.length > 0) {
            const stepLines = response.step_results.map((sr: any) => {
              const stepStatus = sr.skipped ? 'SKIPPED' : (sr.success ? 'OK' : 'FAILED');
              return `  ${sr.step_id || `Step ${sr.step_order}`} [${sr.step_type || 'tool'}]: ${sr.tool_slug} [${stepStatus}] (${sr.duration_ms}ms)`;
            }).join('\n');
            pauseText += `\n\nCompleted steps:\n${stepLines}`;
          }

          const result: any[] = [{ type: 'text', text: pauseText }];

          // Pass resume token as an embedded resource, NOT in visible text.
          // This prevents the token from being rendered in MCP-visible output
          // while still allowing the caller to extract and use it programmatically.
          if (response.resume_token) {
            result.push({
              type: 'resource',
              resource: {
                uri: `jaumemory://skill-resume/${args.slug}`,
                mimeType: 'application/json',
                text: JSON.stringify({
                  resume_token: response.resume_token,
                  slug: args.slug,
                  expires_in_seconds: 900
                })
              }
            });
          }

          return result;
        }

        const statusLabel = response.success ? 'SUCCESS' : 'FAILED';

        // Build step results summary
        const stepLines = response.step_results.map((sr: any) => {
          const stepStatus = sr.skipped ? 'SKIPPED' : (sr.success ? 'OK' : 'FAILED');
          const stepLabel = sr.step_id ? `${sr.step_id} [${sr.step_type || 'tool'}]` : `Step ${sr.step_order}`;
          let line = `  ${stepLabel}: ${sr.tool_slug} [${stepStatus}] (${sr.duration_ms}ms)`;
          if (sr.error) {
            line += `\n    Error: ${sr.error}`;
          }
          if (sr.output_classification === 'OUTPUT_SENSITIVE' || sr.output_classification === 'OUTPUT_UNCLASSIFIED' || sr.output_classification === 'OUTPUT_INTERNAL') {
            line += `\n    Output: [REDACTED - sensitive]`;
          } else if (sr.response_body && !sr.skipped) {
            // Truncate long response bodies
            const body = sr.response_body.length > 200
              ? sr.response_body.substring(0, 200) + '...'
              : sr.response_body;
            line += `\n    Response: ${body}`;
          }
          return line;
        }).join('\n');

        let resultText = `Skill Execution [${statusLabel}]
Duration: ${response.total_duration_ms}ms
Classification: ${response.output_classification}
${response.error ? `Error: ${response.error}\n` : ''}
Steps:
${stepLines}`;

        // Fail-closed: only show output if explicitly PUBLIC
        if (response.output_json && response.output_classification === 'OUTPUT_PUBLIC') {
          resultText += `\n\nFinal Output:\n${response.output_json}`;
        } else if (response.output_json) {
          resultText += `\n\nFinal Output: [REDACTED - contains sensitive data]`;
        }

        return [
          {
            type: 'text',
            text: resultText
          }
        ];
      } catch (error) {
        logger.error('Failed to execute skill:', error);
        throw error;
      }
    }
  };
}
