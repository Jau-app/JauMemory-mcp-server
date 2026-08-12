/**
 * Fix 1 acceptance (plan B5/C4): status classification and Retry-After
 * bounds are test-pinned.
 */
import { describe, test, expect } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  AuthOutcomeUnknownError,
  boundedRetryAfterMs,
  classifyHttpError,
  RETRY_AFTER_CAP_MS,
  TOTAL_CALL_CAP_MS,
  LOGIN_TIMEOUT_MS,
  AUTHENTICATE_TIMEOUT_MS,
} from '../src/config/httpPolicy.js';

function axiosErrorWithStatus(status?: number): AxiosError {
  const err = new AxiosError('boom');
  if (status !== undefined) {
    err.response = {
      status,
      statusText: 'x',
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
  }
  return err;
}

describe('classifyHttpError (B5 table)', () => {
  test.each([408, 409, 423, 425, 429, 500, 502, 503])('%i is retryable', (s) => {
    expect(classifyHttpError(axiosErrorWithStatus(s))).toBe('retryable');
  });

  test.each([400, 401, 403, 404, 410, 422])('%i is terminal', (s) => {
    expect(classifyHttpError(axiosErrorWithStatus(s))).toBe('terminal');
  });

  test('timeout / network (no response) is retryable', () => {
    expect(classifyHttpError(axiosErrorWithStatus(undefined))).toBe('retryable');
  });

  test('unmodeled 4xx fails closed as terminal', () => {
    expect(classifyHttpError(axiosErrorWithStatus(418))).toBe('terminal');
  });
});

describe('boundedRetryAfterMs (C4)', () => {
  test('absent or garbage → 0', () => {
    expect(boundedRetryAfterMs(undefined)).toBe(0);
    expect(boundedRetryAfterMs('not-a-value')).toBe(0);
  });

  test('seconds form, capped at RETRY_AFTER_CAP_MS', () => {
    expect(boundedRetryAfterMs('2')).toBe(2000);
    expect(boundedRetryAfterMs('3600')).toBe(RETRY_AFTER_CAP_MS);
  });

  test('HTTP-date in the past → 0; never negative', () => {
    expect(boundedRetryAfterMs(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  test('total-call cap exceeds a single request bound plus one wait', () => {
    // Structural pin: 90 s total must cover one request + one capped wait.
    expect(TOTAL_CALL_CAP_MS).toBeGreaterThanOrEqual(RETRY_AFTER_CAP_MS + 15_000);
  });
});

describe('AuthOutcomeUnknownError (B8/C1)', () => {
  test('distinct class, carries request id, names verified revocation surface only', () => {
    const err = new AuthOutcomeUnknownError('req-123');
    expect(err.name).toBe('AuthOutcomeUnknownError');
    expect(err.requestId).toBe('req-123');
    expect(err.message).toContain('mcp_login');
    expect(err.message).toContain('logout-everywhere');
    // C1: must NOT claim MCP-Connections visibility, and must not read
    // as a generic transient retry.
    expect(err.message).not.toMatch(/MCP Connections/i);
    expect(err.message).not.toMatch(/retry on the next call/i);
  });
});

describe('timeout constants', () => {
  test('login is short; authenticate is longer but bounded', () => {
    expect(LOGIN_TIMEOUT_MS).toBe(15_000);
    expect(AUTHENTICATE_TIMEOUT_MS).toBe(60_000);
  });
});
