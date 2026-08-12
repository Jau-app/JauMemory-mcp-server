/**
 * API base-URL resolution and issuer pairing (hardening plan Fix 2,
 * B2/B4/C3).
 *
 * Supported issuers (owner decision 2026-08-12): production
 * (mem.jau.app) and localhost for development. Cached tokens are bound
 * to the origin that issued them and refuse to travel anywhere else.
 *
 * This module is the ONLY place that reads JAUMEMORY_API_URL; the
 * doc-lint pins that (grep test in the seed suite).
 */

export const PRODUCTION_API_URL = 'https://mem.jau.app';
export const PRODUCTION_GRPC_ADDRESS = 'mem.jau.app:50051';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopbackHost(host: string): boolean {
  // Strip a :port suffix if present (host may arrive as host:port).
  const bare = host.startsWith('[')
    ? host.replace(/\]:\d+$/, ']')
    : host.replace(/:\d+$/, '');
  return LOOPBACK_HOSTS.has(bare.toLowerCase());
}

/**
 * Resolve and validate the API base URL. `https:` is required except for
 * explicit loopback development hosts. Throws on anything else — a
 * plaintext non-loopback URL must never receive credentials.
 */
export function resolveApiUrl(): string {
  const raw = (process.env.JAUMEMORY_API_URL || PRODUCTION_API_URL).trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`JAUMEMORY_API_URL is not a valid URL: ${raw}`);
  }
  if (parsed.protocol === 'https:') return raw;
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.host)) return raw;
  throw new Error(
    `JAUMEMORY_API_URL must be https:// (or http:// on localhost for ` +
      `development); refusing ${raw}`,
  );
}

/**
 * Issuer pairing (B2): the bearer JWT also travels in gRPC metadata, so
 * the API origin and gRPC target must belong to the same issuer.
 * Production API pairs ONLY with the production gRPC address; a loopback
 * API pairs ONLY with a loopback gRPC target. Any other combination is
 * refused before any credentialed call is made.
 *
 * TLS-off gRPC is refused unless the gRPC host is loopback.
 */
export function assertIssuerPairing(apiUrl: string, grpcAddress: string, grpcUseTls: boolean): void {
  const apiIsProd = apiUrl === PRODUCTION_API_URL;
  const apiIsLoopback = isLoopbackHost(new URL(apiUrl).host);
  const grpcIsLoopback = isLoopbackHost(grpcAddress);

  if (!grpcUseTls && !grpcIsLoopback) {
    throw new Error(
      `JAUMEMORY_GRPC_USE_TLS=false is only allowed for loopback gRPC ` +
        `targets; refusing plaintext to ${grpcAddress}`,
    );
  }
  if (apiIsProd && grpcAddress !== PRODUCTION_GRPC_ADDRESS) {
    throw new Error(
      `Issuer pairing violation: production API may only pair with ` +
        `${PRODUCTION_GRPC_ADDRESS}, got ${grpcAddress}`,
    );
  }
  if (apiIsLoopback && !grpcIsLoopback) {
    throw new Error(
      `Issuer pairing violation: localhost API may only pair with a ` +
        `loopback gRPC target, got ${grpcAddress}`,
    );
  }
  if (!apiIsProd && !apiIsLoopback) {
    // resolveApiUrl() already rejects these; defense in depth.
    throw new Error(`Unsupported API issuer: ${apiUrl}`);
  }
}
