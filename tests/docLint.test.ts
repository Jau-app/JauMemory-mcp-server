/**
 * Doc-lint (plan Fix 5, B6/C-final): documentation may not drift from
 * the code.
 *
 *  1. Every variable in .env.example is read somewhere in src/.
 *  2. Every project env var read in src/ is either documented in
 *     .env.example or on the explicit deprecated allowlist (each entry
 *     scheduled for removal in 0.6.0 with the env-driven login flow).
 *  3. MCP_AUTH_FLOW.md describes the real login request body.
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Env vars read ONLY by the deprecated env-driven login flow. */
const DEPRECATED_ENV = new Set([
  'JAUMEMORY_USERNAME', // removal 0.6.0
  'JAUMEMORY_EMAIL', // removal 0.6.0
  'JAUMEMORY_REQUEST_ID', // removal 0.6.0
  'JAUMEMORY_AUTH_TOKEN', // removal 0.6.0
  'JAUMEMORY_AUTH_TOKEN_MANUAL', // undocumented by decision (tools-only flow)
]);

/** Platform/runtime vars outside the project's documentation contract. */
const PLATFORM_ENV = new Set(['NODE_ENV', 'APPDATA', 'USERPROFILE', 'PRODUCTION', 'RUST_ENV', 'USERNAME']);

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) collectTsFiles(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.bak')) out.push(p);
  }
  return out;
}

const srcFiles = collectTsFiles(path.join(repoRoot, 'src'));
const srcText = srcFiles.map((f) => readFileSync(f, 'utf-8')).join('\n');
const envReads = new Set(
  [...srcText.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]),
);

const envExample = readFileSync(path.join(repoRoot, '.env.example'), 'utf-8');
const documented = new Set(
  [...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
);

describe('.env.example ↔ code contract', () => {
  test('every documented variable is read by src/', () => {
    const unread = [...documented].filter((v) => !envReads.has(v));
    expect(unread).toEqual([]);
  });

  test('every project env read is documented or deprecated-allowlisted', () => {
    const undocumented = [...envReads].filter(
      (v) => !documented.has(v) && !DEPRECATED_ENV.has(v) && !PLATFORM_ENV.has(v),
    );
    expect(undocumented).toEqual([]);
  });

  test('no credential-bearing variables are documented', () => {
    for (const v of documented) {
      expect(v).not.toMatch(/PASSWORD|AUTH_HASH|SECRET|TOKEN$/);
    }
  });
});

describe('MCP_AUTH_FLOW.md ↔ code contract', () => {
  const flow = readFileSync(path.join(repoRoot, 'MCP_AUTH_FLOW.md'), 'utf-8');
  const authManager = readFileSync(path.join(repoRoot, 'src/auth/AuthManager.ts'), 'utf-8');

  test('documented request fields exist verbatim in AuthManager', () => {
    for (const field of ['date_nonce', 'connection_name', 'request_hash']) {
      expect(flow).toContain(field);
      expect(authManager).toContain(field);
    }
  });

  test('doc no longer claims username/email are sent', () => {
    expect(flow).toMatch(/no username or email is ever sent/i);
  });

  test('env-driven flow carries its deprecation note', () => {
    expect(flow).toMatch(/deprecated and will be removed in 0\.6\.0/);
  });
});

describe('README credential hygiene (auditor D4 + E1)', () => {
  // README.md ships in the npm tarball; README-INTERNAL is repo-facing.
  for (const name of ['README.md', 'README-INTERNAL.md']) {
    const readme = readFileSync(path.join(repoRoot, name), 'utf-8');

    test(`${name}: no credential/identity env vars are documented`, () => {
      expect(readme).not.toMatch(
        /JAUMEMORY_PASSWORD|JAUMEMORY_AUTH_HASH|JAUMEMORY_USERNAME|JAUMEMORY_EMAIL/,
      );
    });

    test(`${name}: tool-driven auth flow is the documented path`, () => {
      expect(readme).toMatch(/mcp_login/);
      expect(readme).toMatch(/mcp_authenticate/);
    });
  }
});
