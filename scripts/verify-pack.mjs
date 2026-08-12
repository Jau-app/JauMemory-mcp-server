#!/usr/bin/env node
/**
 * Publish-content gate (hardening plan Fix 4, A9): asserts the npm
 * tarball contains exactly what the allowlist intends — no source maps,
 * no src/, no stray dotfiles — and everything the runtime needs.
 *
 * Runs as part of prepublishOnly and standalone via
 * `npm run verify:pack`. Exit 0 = PASS, 1 = violation.
 */
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

// Windows: npm is npm.cmd, and Node >= 18.20 (CVE-2024-27980) refuses to
// spawn .cmd without a shell — spawn EINVAL (auditor D3). The argv here
// is entirely fixed literals, so shell mode introduces no injection
// surface.
const isWindows = process.platform === 'win32';
const { stdout } = await execFile(
  isWindows ? 'npm.cmd' : 'npm',
  ['pack', '--dry-run', '--json'],
  { maxBuffer: 16 * 1024 * 1024, shell: isWindows },
);
const [report] = JSON.parse(stdout);
const files = report.files.map((f) => f.path);

const failures = [];

// Nothing forbidden.
for (const f of files) {
  if (f.endsWith('.map')) failures.push(`source map shipped: ${f}`);
  if (f.startsWith('src/')) failures.push(`source file shipped: ${f}`);
  if (f.startsWith('shared/')) failures.push(`non-runtime dir shipped: ${f}`);
  if (f.startsWith('.dev/') || f.startsWith('.auth-cache/')) failures.push(`local dir shipped: ${f}`);
  if (f === '.env') failures.push('real .env shipped');
}

// Everything required.
const required = [
  'dist/index.js',
  'dist/auth/AuthManager.js',
  'dist/auth/winAcl.js',
  'dist/config/httpPolicy.js',
  'dist/config/apiUrl.js',
  'package.json',
  '.env.example',
];
const PROTOS = [
  'admin', 'agent', 'collections', 'common', 'credentials', 'development',
  'memory', 'pattern', 'skills', 'tools', 'vector',
];
for (const p of PROTOS) required.push(`proto/${p}.proto`);
for (const r of required) {
  if (!files.includes(r)) failures.push(`required file missing from tarball: ${r}`);
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  console.error(`verify-pack: FAIL (${failures.length} problem(s); ${files.length} files in tarball)`);
  process.exit(1);
}
console.log(`verify-pack: PASS (${files.length} files in tarball)`);
