/**
 * Shared gRPC TLS configuration.
 *
 * TLS is on by default; can only be disabled explicitly for local development.
 * Refuses to disable TLS under production mode.
 *
 * Plan A2 (default-on TLS) + review H1 (opt-in cert pinning).
 *
 * ## Cert pinning (review H1)
 *
 * `grpc.credentials.createSsl()` with no args verifies the peer cert
 * against the system trust store — i.e., any of hundreds of root CAs in
 * the OS bundle can issue a cert for `mem.jau.app` and silently MITM the
 * connection. For deployments that want stronger-than-system-CA
 * assurance, set `JAUMEMORY_GRPC_PINNED_SHA256` to the hex-encoded
 * SHA-256 fingerprint of the expected leaf certificate (or any cert in
 * the chain — the pin matches if ANY cert in the verified chain hashes
 * to the pinned value, so intermediate-CA pinning works too).
 *
 * Pinning is OFF by default (no env set) to avoid breaking deployments
 * that don't want to maintain a fingerprint. When set, a mismatch is a
 * hard reject — no fallback to system-CA-only verification.
 *
 * To compute a fingerprint:
 *   echo | openssl s_client -connect mem.jau.app:50051 2>/dev/null \
 *     | openssl x509 -noout -fingerprint -sha256 \
 *     | sed 's/SHA256 Fingerprint=//; s/://g; y/ABCDEF/abcdef/'
 */

import * as grpc from '@grpc/grpc-js';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import {
  assertIssuerPairing,
  PRODUCTION_GRPC_ADDRESS,
  resolveApiUrl,
} from '../config/apiUrl.js';

const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.PRODUCTION === 'true' ||
  process.env.RUST_ENV === 'production';
const explicitDisable = process.env.JAUMEMORY_GRPC_USE_TLS === 'false';

if (isProduction && explicitDisable) {
  throw new Error('FATAL: Cannot disable gRPC TLS in production mode');
}

export const grpcUseTls = !explicitDisable;
export const grpcAddress =
  process.env.JAUMEMORY_GRPC_URL || PRODUCTION_GRPC_ADDRESS;

// Hardening 0.5.1 (Fix 2, B2): the bearer JWT travels in gRPC metadata,
// so the API origin and gRPC target must belong to the same issuer, and
// plaintext gRPC is loopback-only. Violations are fatal at load — before
// any credentialed call can be made.
assertIssuerPairing(resolveApiUrl(), grpcAddress, grpcUseTls);

/**
 * Pinned SHA-256 fingerprint (hex, lowercase, colon-stripped) of an
 * expected cert in the verified chain. When set, the gRPC TLS handshake
 * will reject any peer whose cert chain doesn't include a cert with this
 * fingerprint. Empty / unset = system-CA-only verification (default).
 */
const pinnedSha256 = (process.env.JAUMEMORY_GRPC_PINNED_SHA256 || '')
  .trim()
  .toLowerCase()
  .replace(/:/g, '');

if (pinnedSha256 && !/^[a-f0-9]{64}$/.test(pinnedSha256)) {
  throw new Error(
    `FATAL: JAUMEMORY_GRPC_PINNED_SHA256 must be 64 hex chars (got "${pinnedSha256.slice(0, 16)}...")`
  );
}

/**
 * Build gRPC channel credentials.
 *
 * - When `useTls` is true (the default everywhere except local dev with
 *   `JAUMEMORY_GRPC_USE_TLS=false`): secure credentials, optionally
 *   pinned via JAUMEMORY_GRPC_PINNED_SHA256.
 * - When `useTls` is false: plaintext insecure credentials. Note that
 *   the module-level guard at the top of this file rejects this in
 *   production mode (NODE_ENV=production etc.) — by the time this
 *   function runs, `useTls=false` is only possible in dev.
 *
 * All gRPC client classes (memory, agent, vector, etc.) should call
 * this helper instead of constructing credentials inline so the
 * pinning policy is centralized.
 */
export function buildCredentials(useTls: boolean = grpcUseTls): grpc.ChannelCredentials {
  if (!useTls) {
    return grpc.credentials.createInsecure();
  }

  // No pin → standard system-CA verification.
  if (!pinnedSha256) {
    return grpc.credentials.createSsl();
  }

  // With a pin: provide a `verifyOptions.checkServerIdentity` that
  // walks the verified chain and asserts at least one cert hashes to
  // the pinned SHA-256. The chain has already been verified against
  // the system CAs at this point — pinning is an ADDITIONAL gate, not
  // a replacement for CA validation.
  const checkServerIdentity = (
    _hostname: string,
    cert: { raw?: Buffer; issuerCertificate?: any }
  ): Error | undefined => {
    let walker: any = cert;
    const seen = new Set<unknown>();
    while (walker && !seen.has(walker)) {
      seen.add(walker);
      const der = walker.raw;
      if (der instanceof Buffer) {
        const fp = createHash('sha256').update(der).digest('hex');
        if (fp === pinnedSha256) {
          return undefined; // pin matched
        }
      }
      walker = walker.issuerCertificate;
      // Defensive: a self-signed cert often points its issuer back to
      // itself, which our `seen` guard catches; otherwise we'd loop.
    }
    logger.error(
      'gRPC cert pin MISMATCH: peer cert chain does not contain a cert with the pinned SHA-256',
      { pinnedSha256: pinnedSha256.slice(0, 16) + '…' }
    );
    return new Error(
      'JAUMEMORY_GRPC_PINNED_SHA256 mismatch: refusing connection'
    );
  };

  return grpc.credentials.createSsl(null, null, null, {
    checkServerIdentity,
  });
}
