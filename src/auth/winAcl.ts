/**
 * Windows per-file ACL hardening (plan Fix 3, B7).
 *
 * On Windows, POSIX mode bits are advisory no-ops; ACLs are the real
 * access control. This module stamps and verifies restrictive ACLs on
 * credential artifacts:
 *
 *   - grants: current user, SYSTEM (S-1-5-18), Administrators
 *     (S-1-5-32-544) — expressed as SIDs, immune to username spaces and
 *     UI-language localization;
 *   - inheritance removed, so a permissive parent directory cannot
 *     re-broaden the file;
 *   - verification asserts the broad principals Everyone (S-1-1-0),
 *     Users (S-1-5-32-545), and Authenticated Users (S-1-5-11) are
 *     ABSENT.
 *
 * Command safety (B7): every invocation uses execFile with an argv
 * array — no shell string interpolation of paths or usernames, ever.
 *
 * All operations are fail-soft for callers: apply/verify failures are
 * reported via return value / thrown Error, and the call sites log a
 * warning without blocking login or refresh.
 */
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execFile = promisify(execFileCb);

/** Well-known SIDs. */
export const SID_SYSTEM = 'S-1-5-18';
export const SID_ADMINISTRATORS = 'S-1-5-32-544';
export const SID_EVERYONE = 'S-1-1-0';
export const SID_BUILTIN_USERS = 'S-1-5-32-545';
export const SID_AUTHENTICATED_USERS = 'S-1-5-11';

export const FORBIDDEN_SIDS = [SID_EVERYONE, SID_BUILTIN_USERS, SID_AUTHENTICATED_USERS];

let cachedUserSid: string | undefined;

/**
 * Resolve the current user's SID via `whoami /user /fo csv` (argv, no
 * shell). CSV form is stable across display languages; the SID is the
 * last field of the second line.
 */
export async function getCurrentUserSid(): Promise<string> {
  if (cachedUserSid) return cachedUserSid;
  const { stdout } = await execFile('whoami', ['/user', '/fo', 'csv'], { windowsHide: true });
  const lines = stdout.trim().split(/\r?\n/);
  const dataLine = lines[lines.length - 1];
  const fields = dataLine.split('","').map(f => f.replace(/^"|"$/g, ''));
  const sid = fields[fields.length - 1]?.trim();
  if (!sid || !/^S-1-[0-9-]+$/.test(sid)) {
    throw new Error(`Could not parse current user SID from whoami output`);
  }
  cachedUserSid = sid;
  return sid;
}

/** SDDL two-letter aliases → full SIDs (the set icacls commonly emits). */
const SDDL_ALIAS: Record<string, string> = {
  SY: SID_SYSTEM,
  BA: SID_ADMINISTRATORS,
  WD: SID_EVERYONE,
  BU: SID_BUILTIN_USERS,
  AU: SID_AUTHENTICATED_USERS,
};

function normalizeSddlSid(token: string): string {
  return SDDL_ALIAS[token] ?? token;
}

/**
 * Read a target's DACL as SDDL via `icacls /save` (canonical SIDs, no
 * localized account names). The save file is UTF-16LE: line 1 the file
 * name, line 2 the SDDL string.
 */
async function readDaclSddl(targetPath: string): Promise<string> {
  const { mkdtemp, readFile, rm } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const path = await import('path');
  const dir = await mkdtemp(path.join(tmpdir(), 'jaumemory-acl-'));
  const saveFile = path.join(dir, 'acl.txt');
  try {
    await execFile('icacls', [targetPath, '/save', saveFile], {
      windowsHide: true,
      cwd: path.dirname(targetPath),
    });
    const raw = (await readFile(saveFile)).toString('utf16le');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const sddl = lines[1];
    if (!sddl || !sddl.startsWith('D:')) {
      throw new Error(`unexpected icacls /save output for ${targetPath}`);
    }
    return sddl;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

interface SddlAce {
  type: string;
  flags: string;
  rights: string;
  sid: string;
}

function parseDacl(sddl: string): { protectedDacl: boolean; aces: SddlAce[] } {
  const daclFlags = sddl.slice(2, sddl.indexOf('('));
  const aces: SddlAce[] = [];
  for (const m of sddl.matchAll(/\(([^)]+)\)/g)) {
    const parts = m[1].split(';');
    aces.push({
      type: parts[0],
      flags: parts[1] ?? '',
      rights: parts[2] ?? '',
      sid: normalizeSddlSid(parts[5] ?? ''),
    });
  }
  return { protectedDacl: daclFlags.includes('P'), aces };
}

/**
 * Stamp a restrictive ACL: inheritance removed; full control for exactly
 * {current user, SYSTEM, Administrators}. `/grant:r` alone does not
 * remove unrelated explicit ACEs (auditor D2), so after granting, any
 * principal outside the allowlist is explicitly `/remove`d.
 * Directories get container-inherit flags so children default closed.
 */
export async function applyFileAcl(targetPath: string, opts?: { container?: boolean }): Promise<void> {
  const sid = await getCurrentUserSid();
  const inherit = opts?.container ? '(OI)(CI)' : '';
  await execFile(
    'icacls',
    [
      targetPath,
      '/inheritance:r',
      '/grant:r', `*${sid}:${inherit}F`,
      '/grant:r', `*${SID_SYSTEM}:${inherit}F`,
      '/grant:r', `*${SID_ADMINISTRATORS}:${inherit}F`,
    ],
    { windowsHide: true },
  );

  // Remove every explicit principal outside the allowlist.
  const allow = new Set([sid, SID_SYSTEM, SID_ADMINISTRATORS]);
  const { aces } = parseDacl(await readDaclSddl(targetPath));
  const extras = [...new Set(aces.map((a) => a.sid))].filter((s) => !allow.has(s));
  for (const extra of extras) {
    await execFile('icacls', [targetPath, '/remove', `*${extra}`], { windowsHide: true });
  }
}

/**
 * Verify the EXACT locked ACL (auditor D2): DACL protected (no
 * inheritance), every ACE an Allow with full access, and the principal
 * set exactly {current user, SYSTEM, Administrators} — nothing extra,
 * and the broad principals asserted absent by SID.
 */
export async function verifyFileAcl(targetPath: string): Promise<void> {
  const sid = await getCurrentUserSid();
  const { protectedDacl, aces } = parseDacl(await readDaclSddl(targetPath));

  if (!protectedDacl) {
    throw new Error(`ACL verify failed: inheritance not removed on ${targetPath}`);
  }
  for (const ace of aces) {
    if (ace.type !== 'A') {
      throw new Error(`ACL verify failed: non-Allow ACE (${ace.type}) on ${targetPath}`);
    }
    if (ace.rights !== 'FA') {
      throw new Error(`ACL verify failed: ACE rights ${ace.rights} (expected FA) on ${targetPath}`);
    }
  }
  const present = new Set(aces.map((a) => a.sid));
  const expected = new Set([sid, SID_SYSTEM, SID_ADMINISTRATORS]);
  for (const s of expected) {
    if (!present.has(s)) {
      throw new Error(`ACL verify failed: required principal ${s} missing on ${targetPath}`);
    }
  }
  for (const s of present) {
    if (!expected.has(s)) {
      throw new Error(`ACL verify failed: unexpected principal ${s} on ${targetPath}`);
    }
  }
  for (const forbidden of FORBIDDEN_SIDS) {
    if (present.has(forbidden)) {
      throw new Error(`ACL verify failed: broad principal ${forbidden} present on ${targetPath}`);
    }
  }
}

/**
 * Fail-soft wrapper used by credential write/migrate/repair sites: an
 * ACL failure must never block login or refresh.
 */
export async function tryApplyFileAcl(targetPath: string, opts?: { container?: boolean }): Promise<void> {
  if (process.platform !== 'win32') return;
  try {
    await applyFileAcl(targetPath, opts);
  } catch (err) {
    logger.warn('Windows ACL stamp failed (continuing)', {
      target: targetPath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
