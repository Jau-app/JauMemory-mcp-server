/**
 * Fix 2 acceptance (plan B2/B4): URL resolution validation and API↔gRPC
 * issuer pairing.
 */
import { afterEach, describe, test, expect } from '@jest/globals';
import {
  assertIssuerPairing,
  isLoopbackHost,
  PRODUCTION_API_URL,
  PRODUCTION_GRPC_ADDRESS,
  resolveApiUrl,
} from '../src/config/apiUrl.js';

const ENV = 'JAUMEMORY_API_URL';
const prior = process.env[ENV];

afterEach(() => {
  if (prior === undefined) delete process.env[ENV];
  else process.env[ENV] = prior;
});

describe('resolveApiUrl', () => {
  test('unset → production default', () => {
    delete process.env[ENV];
    expect(resolveApiUrl()).toBe(PRODUCTION_API_URL);
  });

  test('https origin accepted; trailing slash trimmed', () => {
    process.env[ENV] = 'https://mem.jau.app/';
    expect(resolveApiUrl()).toBe('https://mem.jau.app');
  });

  test('http localhost accepted for dev', () => {
    process.env[ENV] = 'http://localhost:8080';
    expect(resolveApiUrl()).toBe('http://localhost:8080');
    process.env[ENV] = 'http://127.0.0.1:8080';
    expect(resolveApiUrl()).toBe('http://127.0.0.1:8080');
  });

  test('http non-loopback refused', () => {
    process.env[ENV] = 'http://internal.example.com';
    expect(() => resolveApiUrl()).toThrow(/https/);
  });

  test('garbage refused', () => {
    process.env[ENV] = 'not a url';
    expect(() => resolveApiUrl()).toThrow(/not a valid URL/);
  });
});

describe('isLoopbackHost', () => {
  test('loopback forms', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('localhost:50051')).toBe(true);
    expect(isLoopbackHost('127.0.0.1:50051')).toBe(true);
    expect(isLoopbackHost('mem.jau.app:50051')).toBe(false);
  });
});

describe('assertIssuerPairing (B2)', () => {
  test('prod API ↔ prod gRPC passes', () => {
    expect(() =>
      assertIssuerPairing(PRODUCTION_API_URL, PRODUCTION_GRPC_ADDRESS, true),
    ).not.toThrow();
  });

  test('prod API with non-prod gRPC target refused', () => {
    expect(() =>
      assertIssuerPairing(PRODUCTION_API_URL, 'evil.example.com:50051', true),
    ).toThrow(/pairing violation/);
  });

  test('localhost API with non-loopback gRPC refused', () => {
    expect(() =>
      assertIssuerPairing('http://localhost:8080', PRODUCTION_GRPC_ADDRESS, true),
    ).toThrow(/pairing violation/);
  });

  test('localhost API with loopback gRPC passes, TLS off allowed on loopback only', () => {
    expect(() =>
      assertIssuerPairing('http://localhost:8080', 'localhost:50051', false),
    ).not.toThrow();
    expect(() =>
      assertIssuerPairing(PRODUCTION_API_URL, PRODUCTION_GRPC_ADDRESS, false),
    ).toThrow(/loopback/);
  });
});
