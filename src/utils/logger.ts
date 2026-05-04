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
import { redactSecrets } from './redaction.js';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Winston format that walks every meta field through redactSecrets and
 * scrubs embedded secret patterns from the message string. Mutates info
 * in place so winston's symbol-keyed internals (LEVEL, MESSAGE, SPLAT)
 * are preserved — wholesale-replacing info would strip those and break
 * downstream transports.
 *
 * Skipped keys are `level`, `timestamp`, and our own `service` tag from
 * `defaultMeta`. Note `message` is NOT in the skip list (review fix M1):
 * `logger.info({ secret: 'sk-...' })` puts the object in `info.message`
 * directly, and the prior version's `'message'` skip let it bypass
 * redaction entirely. The string-message branch above handles the
 * common `logger.info('text')` shape; the loop below handles object-
 * message and other meta values via the recursive redactor.
 *
 * Error objects are special-cased (review fix H3): an axios/fetch error
 * passed via `logger.error('x', err)` lands in `info` as a meta
 * property (or as `info.message` itself when winston converts), and a
 * naive `Object.entries` walk skips its non-enumerable `.message` and
 * `.stack` properties. Worse, axios errors carry `.config.data` with
 * the original request body — for AuthManager error sites that body
 * contains `auth_token`. The `redactErrorIfNeeded` helper rewrites
 * each meta value: if it's an Error, replace with a plain object that
 * has redacted message/stack and NO config; otherwise hand off to
 * redactSecrets.
 */
function redactErrorIfNeeded(value: unknown): unknown {
  if (value instanceof Error) {
    // Re-build as plain object so downstream JSON serializers see the
    // sanitized message/stack and never reach `.config`/`.request`/etc.
    return {
      name: value.name,
      message: redactSecrets(value.message ?? '') as string,
      stack: typeof value.stack === 'string'
        ? (redactSecrets(value.stack) as string)
        : undefined,
    };
  }
  return redactSecrets(value);
}

const redactFormat = winston.format((info) => {
  // String message: scrub embedded secret patterns.
  if (typeof info.message === 'string') {
    info.message = redactSecrets(info.message) as string;
  } else if (info.message instanceof Error) {
    // winston.format.errors({stack: true}) usually unwraps Error into a
    // plain object before we get here, but defend in case it didn't.
    info.message = redactErrorIfNeeded(info.message);
  }
  // Walk every other field (including object-form `message` after the
  // above branches) through the recursive redactor or Error-aware
  // helper. Skip only winston/format internals + the defaultMeta tag.
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'timestamp' || key === 'service') {
      continue;
    }
    if (key === 'message' && typeof info.message === 'string') {
      // Already redacted above; don't double-process.
      continue;
    }
    (info as Record<string, unknown>)[key] = redactErrorIfNeeded(
      (info as Record<string, unknown>)[key]
    );
  }
  return info;
});

// Create transports based on environment
const transports: winston.transport[] = [];

// In MCP mode, only log to stderr to keep stdout clean for JSON
transports.push(
  new winston.transports.Console({
    stderrLevels: ['error', 'warn', 'info', 'debug', 'verbose', 'silly'],
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
      })
    )
  })
);

// In production, also log to file
if (isProduction) {
  transports.push(
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  );
  transports.push(
    new winston.transports.File({ 
      filename: 'combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  );
}

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactFormat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'jauauth-mcp' },
  transports
});