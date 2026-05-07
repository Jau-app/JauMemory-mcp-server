/**
 * Logger configuration for production use.
 *
 * Plan A13: redactSecrets is installed as a winston format in the outer
 * format chain so every `logger.*` call is redacted transport-wide. This
 * fixes the AuthManager error-body log sites by construction (rather than
 * relying on each call site to remember to redact). It also pre-empts any
 * future log call sites added by Plan A4 (SMTP-failure outcome logging)
 * and A8 (logout-result reporting), which is why this lands in Phase 1b
 * before those features ship.
 */
import winston from 'winston';
export declare const logger: winston.Logger;
//# sourceMappingURL=logger.d.ts.map