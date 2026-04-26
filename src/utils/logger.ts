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
 * Skipped keys are winston/format internals (`level`, `message`,
 * `timestamp`) and our own `service` tag from `defaultMeta`. Anything
 * else a caller passes in (`logger.info('x', { foo, secret })`) gets
 * redacted before any transport sees it.
 */
const redactFormat = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = redactSecrets(info.message) as string;
  }
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'service') {
      continue;
    }
    (info as Record<string, unknown>)[key] = redactSecrets((info as Record<string, unknown>)[key]);
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