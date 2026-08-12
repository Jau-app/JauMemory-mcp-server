#!/usr/bin/env node
/**
 * Windows ACL verification gate (hardening plan Fix 3).
 *
 * Run on a WINDOWS machine (e.g. via Claude Code in the Windows desktop
 * app) after `npm run build`, once per release:
 *
 *     npm run build && npm run verify:windows-acl
 *
 * What it proves:
 *   1. Stamp + verify round-trip on a scratch file and directory:
 *      exactly {current user, SYSTEM, Administrators} by SID, no
 *      inheritance, and the broad principals Everyone / Users /
 *      Authenticated Users ABSENT.
 *   2. Every existing real credential artifact in %APPDATA%\jaumemory-mcp
 *      passes the same verification.
 *
 * Exit 0 = PASS; 1 = violation; 2 = wrong platform / setup error.
 * The stronger denied-as-second-user test is optional and manual — run
 * it when a second local account exists.
 */
import { mkdtemp, rm, writeFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

if (process.platform !== 'win32') {
  console.error('verify-windows-acl: must run on Windows (got ' + process.platform + ')');
  process.exit(2);
}

const { applyFileAcl, verifyFileAcl } = await import('../dist/auth/winAcl.js').catch(() => {
  console.error('verify-windows-acl: dist/auth/winAcl.js missing — run `npm run build` first');
  process.exit(2);
});

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`ok: ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL: ${label}: ${err?.message ?? err}`);
  }
};

// 1. Scratch round-trip.
const scratch = await mkdtemp(path.join(tmpdir(), 'jaumemory-acl-'));
try {
  const scratchFile = path.join(scratch, 'scratch-credential');
  await writeFile(scratchFile, 'scratch');
  await check('stamp+verify scratch directory', async () => {
    await applyFileAcl(scratch, { container: true });
    await verifyFileAcl(scratch);
  });
  await check('stamp+verify scratch file', async () => {
    await applyFileAcl(scratchFile);
    await verifyFileAcl(scratchFile);
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}

// 2. Real artifacts, if present.
const appData = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming');
const cacheDir = path.join(appData, 'jaumemory-mcp');
let names = [];
try {
  names = await readdir(cacheDir);
} catch {
  console.log(`note: no cache dir at ${cacheDir} (never logged in on this machine) — scratch checks only`);
}
for (const name of names) {
  const artifact =
    name.startsWith('credentials.json') ||
    name === '.salt' ||
    name === 'device-id' ||
    name === 'auth-outcome-unknown.json';
  if (!artifact) continue;
  await check(`real artifact ACL: ${name}`, () => verifyFileAcl(path.join(cacheDir, name)));
}

if (failures > 0) {
  console.error(`verify-windows-acl: FAIL (${failures} violation(s))`);
  process.exit(1);
}
console.log('verify-windows-acl: PASS');
