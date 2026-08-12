/**
 * Fix 2 acceptance for mcp_logout: revocation targets the credentials'
 * stored origin (never an env read), local_only is the explicit
 * offline escape hatch, and absence of credentials means no server call.
 */
import { afterEach, describe, test, expect, jest } from '@jest/globals';
import axios from 'axios';
import { logoutTool } from '../src/mcp/tools/logout.js';

afterEach(() => {
  jest.restoreAllMocks();
});

function clientsWith(overrides: {
  origin?: string;
  sessionId?: string;
  headers?: Record<string, string> | undefined;
}) {
  return {
    auth: {
      getAuthHeaders: async () => overrides.headers ?? { authorization: 'Bearer t' },
      clearSession: async () => {},
      authManager: {
        credentials:
          overrides.origin === undefined && overrides.sessionId === undefined
            ? undefined
            : { origin: overrides.origin, sessionId: overrides.sessionId },
      },
    },
  } as any;
}

describe('mcp_logout origin binding', () => {
  test('revocation posts to the stored credential origin', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any);
    const tool = logoutTool(clientsWith({ origin: 'https://mem.jau.app', sessionId: 's1' }));
    const out = await tool.handler({ scope: 'this' });
    expect(post).toHaveBeenCalledTimes(1);
    expect((post.mock.calls[0] as any[])[0]).toBe('https://mem.jau.app/v1/auth/logout');
    expect(JSON.stringify(out)).toContain('Server session revoked');
  });

  test('local_only=true clears locally and never calls the server', async () => {
    const post = jest.spyOn(axios, 'post');
    const tool = logoutTool(clientsWith({ origin: 'https://mem.jau.app', sessionId: 's1' }));
    const out = await tool.handler({ local_only: true });
    expect(post).not.toHaveBeenCalled();
    expect(JSON.stringify(out)).toContain('intentionally skipped');
  });

  test('no stored origin → no server call, honest message', async () => {
    const post = jest.spyOn(axios, 'post');
    const tool = logoutTool(clientsWith({ sessionId: 's1', origin: undefined }));
    const out = await tool.handler({});
    expect(post).not.toHaveBeenCalled();
    expect(JSON.stringify(out)).toContain('skipped');
  });

  test('missing sessionId falls back to scope=all (upgrade path preserved)', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any);
    const tool = logoutTool(clientsWith({ origin: 'https://mem.jau.app', sessionId: undefined }));
    await tool.handler({ scope: 'this' });
    const body = (post.mock.calls[0] as any[])[1];
    expect(body.scope).toBe('all');
    expect(body.session_id).toBeUndefined();
  });
});
