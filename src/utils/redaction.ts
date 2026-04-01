/**
 * Redaction utilities for MCP tool arguments and logs.
 * Prevents credential secrets from leaking into MCP transport or logs.
 *
 * IMPORTANT: Log output uses strict [REDACTED] with no partial material.
 * The generateHint() function is exported only for UI-facing masked displays.
 */

const SENSITIVE_FIELDS = new Set([
  'value', 'new_value', 'secondary_value', 'new_secondary_value',
  'secret', 'token', 'password', 'api_key', 'apikey',
  'authorization', 'credential', 'private_key', 'privatekey',
  'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
  'client_secret', 'clientsecret',
  // Payload fields that may contain embedded secrets in debug logs
  'request_body', 'input_json', 'metadata_json', 'endpoints_json',
]);

/**
 * Substrings that flag a field as sensitive even if the full key isn't
 * in SENSITIVE_FIELDS. Catches future/variant naming like "api_secret_v2".
 */
const SENSITIVE_SUBSTRINGS = [
  'secret', 'token', 'password', 'passwd', 'credential',
  'private_key', 'privatekey', 'api_key', 'apikey', 'auth',
];

/**
 * Returns true if a field name looks like it contains a secret.
 * Normalizes separators (-, ., _) so that "api-key", "api.key", and
 * "api_key" all match the same substring rules.
 */
function isSensitiveField(name: string): boolean {
  const lower = name.toLowerCase();
  if (SENSITIVE_FIELDS.has(lower)) return true;
  if (lower.startsWith('encrypted_') || lower.startsWith('encrypted')) return true;
  // Normalize separators for substring matching: api-key → apikey, client.secret → clientsecret
  const normalized = lower.replace(/[-._]/g, '');
  if (SENSITIVE_SUBSTRINGS.some(sub => normalized.includes(sub))) return true;
  return false;
}

/**
 * Generate a safe hint from a secret value (e.g. "sk-...9xyz").
 * ONLY use for UI-facing masked displays, NEVER in logs.
 */
export function generateHint(value: string): string {
  if (value.length <= 8) return '****';
  const prefix = value.substring(0, 3);
  const suffix = value.substring(value.length - 4);
  return `${prefix}...${suffix}`;
}

/**
 * Common patterns that indicate a secret value embedded in a string.
 * Used to catch secrets passed as string arguments rather than in keyed fields.
 */
const SECRET_PATTERNS = [
  /Bearer\s+\S+/gi,
  /Basic\s+[A-Za-z0-9+/=]+/gi,
  /\b(?:sk|pk|rk|ak)[_-]\w{8,}/gi,
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /\bey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, // JWT-like
  // Crypto secrets
  /\b0x[a-fA-F0-9]{64}\b/g,                        // Ethereum private key (64 hex)
  /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g,        // Bitcoin WIF private key
  /\bxprv[A-Za-z0-9]{107,108}\b/g,                 // BIP32 extended private key
  /\bed25519:[A-Za-z0-9+/]{64,}/g,                 // ed25519 key material
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, // PEM private key header
  /\b(?:\w+\s){11,23}\w+\b/g,                      // BIP39 mnemonic seed phrase (12-24 words)
];

/**
 * Scan a string for embedded secret patterns and redact them.
 */
function redactStringSecrets(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0; // reset stateful regex
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Recursively redact sensitive fields from a JSON-serializable object.
 * Returns a new object with secrets replaced by strict [REDACTED].
 * Safe for logging — no partial secret material is emitted.
 * Also scans string values for embedded secret patterns (e.g. "Bearer sk-...").
 */
export function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return redactStringSecrets(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSecrets(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (isSensitiveField(key)) {
        // Redact any sensitive field regardless of value type (string, object, array, number)
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSecrets(value);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Redact a header value if the header name is sensitive.
 * Uses strict [REDACTED] — no partial material in logs.
 */
export function redactHeaderValue(headerName: string, value: string): string {
  const lower = headerName.toLowerCase();
  if (lower === 'authorization' || lower === 'x-api-key' || lower === 'cookie') {
    return '[REDACTED]';
  }
  return value;
}
