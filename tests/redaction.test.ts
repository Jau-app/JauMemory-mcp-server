/**
 * Seed suite (plan Fix 0): pins the redaction module's security behavior.
 * These are real regressions guards — log/transport redaction is strict
 * [REDACTED] with no partial secret material.
 */
import { describe, test, expect } from '@jest/globals';
import { redactSecrets, redactHeaderValue, generateHint } from '../src/utils/redaction.js';

describe('redactSecrets', () => {
  test('redacts sensitive keys regardless of value type', () => {
    const out = redactSecrets({
      password: 'hunter2',
      api_key: { nested: 'sk_live_123' },
      refresh_token: ['a', 'b'],
      count: 3,
    }) as Record<string, unknown>;
    expect(out.password).toBe('[REDACTED]');
    expect(out.api_key).toBe('[REDACTED]');
    expect(out.refresh_token).toBe('[REDACTED]');
    expect(out.count).toBe(3);
  });

  test('normalized separator variants are caught', () => {
    const out = redactSecrets({ 'api-key': 'x', 'client.secret': 'y' }) as Record<string, unknown>;
    expect(out['api-key']).toBe('[REDACTED]');
    expect(out['client.secret']).toBe('[REDACTED]');
  });

  test('embedded Bearer and JWT-like strings are redacted inside values', () => {
    const out = redactSecrets({
      note: 'header was Bearer abc123xyz and that is all',
    }) as Record<string, unknown>;
    expect(out.note).not.toContain('abc123xyz');
    expect(out.note).toContain('[REDACTED]');
  });

  test('nested structures are walked; non-sensitive content survives', () => {
    const out = redactSecrets({
      user: { name: 'jeff', settings: { theme: 'dark', token: 't' } },
    }) as any;
    expect(out.user.name).toBe('jeff');
    expect(out.user.settings.theme).toBe('dark');
    expect(out.user.settings.token).toBe('[REDACTED]');
  });

  test('null/undefined/primitives pass through', () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
    expect(redactSecrets(42)).toBe(42);
  });
});

describe('redactHeaderValue', () => {
  test('authorization, x-api-key, cookie are stripped; others pass', () => {
    expect(redactHeaderValue('Authorization', 'Bearer x')).toBe('[REDACTED]');
    expect(redactHeaderValue('X-API-Key', 'k')).toBe('[REDACTED]');
    expect(redactHeaderValue('cookie', 'session=1')).toBe('[REDACTED]');
    expect(redactHeaderValue('content-type', 'application/json')).toBe('application/json');
  });
});

describe('generateHint', () => {
  test('short secrets give no material; long ones give prefix/suffix only', () => {
    expect(generateHint('short')).toBe('****');
    const hint = generateHint('sk_live_abcdefgh9xyz');
    expect(hint).toBe('sk_...9xyz');
    expect(hint.length).toBeLessThan('sk_live_abcdefgh9xyz'.length);
  });
});
