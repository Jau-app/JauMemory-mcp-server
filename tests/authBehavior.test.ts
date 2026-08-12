/**
 * Fix 1/2/3 behavioral acceptance (plan): unknown-outcome handling,
 * pending-origin lifecycle, origin policy on load/refresh, timeout
 * config pins, and artifact mode repair.
 *
 * Every AuthManager is constructed with the cache-dir test seam pointed
 * at a scratch dir — no real user cache is touched.
 */
import { afterAll, beforeAll, afterEach, describe, test, expect, jest } from '@jest/globals';
import axios from 'axios';
import { AxiosError } from 'axios';
import { mkdtemp, mkdir, writeFile, stat, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { AuthManager } from '../src/auth/AuthManager.js';
import { AuthOutcomeUnknownError, AUTHENTICATE_TIMEOUT_MS, LOGIN_TIMEOUT_MS } from '../src/config/httpPolicy.js';
import { PRODUCTION_API_URL } from '../src/config/apiUrl.js';

let scratchCache: string;
const priorApiUrl = process.env.JAUMEMORY_API_URL;

beforeAll(async () => {
  // Injected via the AuthManager cache-dir test seam — no real user
  // cache is ever touched.
  scratchCache = await mkdtemp(path.join(tmpdir(), 'jaumemory-test-cache-'));
});

afterAll(async () => {
  await rm(scratchCache, { recursive: true, force: true });
});

afterEach(() => {
  jest.restoreAllMocks();
  if (priorApiUrl === undefined) delete process.env.JAUMEMORY_API_URL;
  else process.env.JAUMEMORY_API_URL = priorApiUrl;
});

function timeoutAxiosError(): AxiosError {
  const err = new AxiosError('timeout of 60000ms exceeded');
  err.code = 'ECONNABORTED';
  // no err.response: outcome unknown
  return err;
}

function cacheDir(): string {
  return scratchCache;
}

describe('login → pending-origin lifecycle (Fix 2, B3/C2)', () => {
  test('login records a pending origin bound to the resolved URL', async () => {
    delete process.env.JAUMEMORY_API_URL;
    const am = new AuthManager(scratchCache);
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { request_id: 'req-1', approval_url: 'https://x/approve' },
    } as any);

    const out = await am.login('user', 'user@example.com');
    expect(out.requestId).toBe('req-1');
    expect(post).toHaveBeenCalledTimes(1);
    const [, , config] = post.mock.calls[0] as any[];
    expect(config.timeout).toBe(LOGIN_TIMEOUT_MS);

    const pending = (am as any).pendingOrigins.get('req-1');
    expect(pending.origin).toBe(PRODUCTION_API_URL);
  });

  test('authenticate refuses when no pending entry exists (expired/restart)', async () => {
    delete process.env.JAUMEMORY_API_URL;
    const am = new AuthManager(scratchCache);
    const post = jest.spyOn(axios, 'post');
    await expect(
      (am as any).authenticateWithToken('req-none', 'code'),
    ).rejects.toThrow(/No pending login/);
    expect(post).not.toHaveBeenCalled();
  });

  test('authenticate refuses when the env URL changed after login', async () => {
    delete process.env.JAUMEMORY_API_URL;
    const am = new AuthManager(scratchCache);
    (am as any).pendingOrigins.set('req-2', {
      origin: 'http://localhost:9999',
      expiresAt: Date.now() + 60_000,
    });
    const post = jest.spyOn(axios, 'post');
    await expect(
      (am as any).authenticateWithToken('req-2', 'code'),
    ).rejects.toThrow(/Refusing to send the auth code/);
    expect(post).not.toHaveBeenCalled();
  });

  test('expired pending entry is pruned and refused', async () => {
    delete process.env.JAUMEMORY_API_URL;
    const am = new AuthManager(scratchCache);
    (am as any).pendingOrigins.set('req-3', {
      origin: PRODUCTION_API_URL,
      expiresAt: Date.now() - 1,
    });
    await expect(
      (am as any).authenticateWithToken('req-3', 'code'),
    ).rejects.toThrow(/No pending login/);
  });
});

describe('authenticate unknown outcome (Fix 1, B8/C1/C2)', () => {
  test('timeout without response → AuthOutcomeUnknownError + marker, pending consumed', async () => {
    delete process.env.JAUMEMORY_API_URL;
    const am = new AuthManager(scratchCache);
    (am as any).pendingOrigins.set('req-u', {
      origin: PRODUCTION_API_URL,
      expiresAt: Date.now() + 60_000,
    });
    const post = jest.spyOn(axios, 'post').mockRejectedValue(timeoutAxiosError());

    await expect(
      (am as any).authenticateWithToken('req-u', 'code'),
    ).rejects.toThrow(AuthOutcomeUnknownError);

    const [, , config] = post.mock.calls[0] as any[];
    expect(config.timeout).toBe(AUTHENTICATE_TIMEOUT_MS);

    const marker = JSON.parse(
      await readFile(path.join(cacheDir(), 'auth-outcome-unknown.json'), 'utf-8'),
    );
    expect(marker.request_id).toBe('req-u');

    // Single-use: entry deleted even on unknown outcome.
    expect((am as any).pendingOrigins.has('req-u')).toBe(false);
  });

  test('marker file is written mode 0600', async () => {
    if (process.platform === 'win32') return;
    const mode = (await stat(path.join(cacheDir(), 'auth-outcome-unknown.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('origin policy on load (Fix 2, B4/C3)', () => {
  test('mismatched stored origin → credentials dropped, refusal logged', () => {
    delete process.env.JAUMEMORY_API_URL;
    const am = new AuthManager(scratchCache);
    (am as any).credentials = { origin: 'http://localhost:8080', jwtToken: 't' };
    (am as any).applyOriginPolicyAfterLoad();
    expect((am as any).credentials).toBeUndefined();
  });

  test('originless + production default → stamped production', () => {
    delete process.env.JAUMEMORY_API_URL;
    const am = new AuthManager(scratchCache);
    (am as any).credentials = { jwtToken: 't' };
    (am as any).applyOriginPolicyAfterLoad();
    expect((am as any).credentials.origin).toBe(PRODUCTION_API_URL);
  });

  test('originless + override URL → re-login required (no silent blessing)', () => {
    process.env.JAUMEMORY_API_URL = 'http://localhost:8080';
    const am = new AuthManager(scratchCache);
    (am as any).credentials = { jwtToken: 't' };
    (am as any).applyOriginPolicyAfterLoad();
    expect((am as any).credentials).toBeUndefined();
  });
});

describe('refresh origin refusal (Fix 2)', () => {
  test('refresh refuses a foreign-origin credential without clearing it', async () => {
    delete process.env.JAUMEMORY_API_URL;
    const am = new AuthManager(scratchCache);
    (am as any).credentials = {
      origin: 'http://localhost:8080',
      deviceId: 'd',
      refreshSecret: 's',
      jwtToken: 't',
    };
    const post = jest.spyOn(axios, 'post');
    await expect(am.refreshToken()).rejects.toThrow(/Refusing to refresh/);
    expect(post).not.toHaveBeenCalled();
    expect((am as any).credentials).toBeDefined();
  });
});

describe('artifact mode repair (Fix 3, B5-audit)', () => {
  test('a wide-mode stale artifact is repaired before any early return', async () => {
    if (process.platform === 'win32') return;
    delete process.env.JAUMEMORY_API_URL;
    await mkdir(cacheDir(), { recursive: true });
    const stale = path.join(cacheDir(), 'credentials.json.prod-cache');
    await writeFile(stale, '{}', { mode: 0o664 });
    await import('fs/promises').then((fs) => fs.chmod(stale, 0o664));

    const am = new AuthManager(scratchCache);
    await (am as any).loadCachedCredentials();

    const mode = (await stat(stale)).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
