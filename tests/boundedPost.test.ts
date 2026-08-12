/**
 * Auditor D1 acceptance: the HTTP policy is ENFORCED, not just defined.
 *
 *  - boundedPost behavior: one Retry-After wait max, budget-capped,
 *    non-429 never retried.
 *  - Static wiring pins: every in-scope production call goes through
 *    boundedPost; bare axios.post remains ONLY at the two deprecated
 *    env-flow sites in AuthManager.
 */
import { afterEach, describe, test, expect, jest } from '@jest/globals';
import axios from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { boundedPost, TOTAL_CALL_CAP_MS } from '../src/config/httpPolicy.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

afterEach(() => {
  jest.restoreAllMocks();
});

function status429(retryAfterSeconds?: string): AxiosError {
  const err = new AxiosError('rate limited');
  err.response = {
    status: 429,
    statusText: 'Too Many Requests',
    data: {},
    headers: retryAfterSeconds !== undefined ? { 'retry-after': retryAfterSeconds } : {},
    config: { headers: new AxiosHeaders() },
  };
  return err;
}

describe('boundedPost (C4 enforcement)', () => {
  test('429 with Retry-After → exactly one wait then one retry', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(status429('1'))
      .mockResolvedValueOnce({ data: { ok: true } } as any);
    const started = Date.now();
    const res = await boundedPost<{ ok: boolean }>('https://x/y', {}, { timeout: 1000 });
    expect(res.data.ok).toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  test('second 429 surfaces — never a second wait', async () => {
    const post = jest.spyOn(axios, 'post').mockRejectedValue(status429('1'));
    await expect(boundedPost('https://x/y', {}, { timeout: 1000 })).rejects.toThrow('rate limited');
    expect(post).toHaveBeenCalledTimes(2);
  });

  test('429 without Retry-After → no retry', async () => {
    const post = jest.spyOn(axios, 'post').mockRejectedValue(status429(undefined));
    await expect(boundedPost('https://x/y', {}, { timeout: 1000 })).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
  });

  test('wait exceeding the total budget → no retry', async () => {
    // Retry-After caps at 60s; a per-request timeout that leaves no room
    // under TOTAL_CALL_CAP_MS must refuse the wait.
    const post = jest.spyOn(axios, 'post').mockRejectedValue(status429('60'));
    await expect(
      boundedPost('https://x/y', {}, { timeout: TOTAL_CALL_CAP_MS }),
    ).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
  });

  test('non-429 errors are surfaced unchanged with no retry', async () => {
    const err = new AxiosError('boom');
    err.response = {
      status: 503,
      statusText: 'x',
      data: {},
      headers: { 'retry-after': '1' },
      config: { headers: new AxiosHeaders() },
    };
    const post = jest.spyOn(axios, 'post').mockRejectedValue(err);
    await expect(boundedPost('https://x/y', {}, { timeout: 1000 })).rejects.toThrow('boom');
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('production wiring pins (D1)', () => {
  test('AuthManager: boundedPost at tool-login/authenticate/refresh; bare axios.post only in the env flow', () => {
    const src = readFileSync(path.join(repoRoot, 'src/auth/AuthManager.ts'), 'utf-8');
    const bounded = src.match(/boundedPost</g) ?? [];
    expect(bounded.length).toBe(3);
    const bare = src.match(/axios\.post</g) ?? [];
    expect(bare.length).toBe(2); // the two deprecated env-flow sites only
  });

  test('logout revocation goes through boundedPost', () => {
    const src = readFileSync(path.join(repoRoot, 'src/mcp/tools/logout.ts'), 'utf-8');
    expect(src).toContain('boundedPost(');
    expect(src).not.toMatch(/axios\.post\(/);
  });
});
