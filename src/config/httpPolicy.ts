/**
 * Network-wait policy (hardening plan Fix 1, B5/C4).
 *
 * Every network wait in the supported (tool-driven) flow is bounded.
 * Constants live here so bounds are tunable in one place and testable.
 *
 * HTTP status classification (B5):
 *   RETRYABLE — timeout, network error, 5xx, 408, 409, 423, 425, 429
 *   TERMINAL  — 400, 401, 403, 404, 410, 422
 *
 * Elapsed-time bounds (C4): the per-request timeout bounds each attempt;
 * a 429 Retry-After wait is additional and bounded separately — at most
 * ONE Retry-After wait per tool invocation, and the total user-visible
 * duration of any single tool call is capped at TOTAL_CALL_CAP_MS
 * regardless of header values.
 */
import axios from 'axios';

/** Per-request timeouts (ms). */
export const LOGIN_TIMEOUT_MS = 15_000;
export const AUTHENTICATE_TIMEOUT_MS = 60_000;
export const FETCH_DOCS_TIMEOUT_MS = 15_000;

/** gRPC per-call deadlines (ms). */
export const GRPC_STANDARD_DEADLINE_MS = 30_000;
export const GRPC_HEAVY_DEADLINE_MS = 120_000; // consolidate/analyze-class

/** 429 handling (C4): one Retry-After wait max, capped. */
export const RETRY_AFTER_CAP_MS = 60_000;
export const TOTAL_CALL_CAP_MS = 90_000;

/** User-facing transient message (data-path timeouts; NOT authenticate). */
export const TRANSIENT_MESSAGE =
  'JauMemory server is busy or restarting — will retry on the next call.';

/**
 * Authenticate-specific outcome-unknown error (B8/C1).
 *
 * Raised when /v1/auth/mcp/authenticate times out or fails ambiguously
 * AFTER the request was sent: the backend consumes the pending auth row
 * and commits the session BEFORE returning the JWT, so the server may
 * hold a live session this client never received. Deliberately NOT
 * labeled transient and never presented as "just retry" — the consumed
 * pending row means a retry cannot succeed.
 *
 * Revocation surface in the message is verified against the backend
 * (2026-08-12): public logout defaults to All and the shared revoke path
 * covers direct mcp_sessions, so web logout-everywhere force-revokes the
 * orphan.
 */
export class AuthOutcomeUnknownError extends Error {
  public readonly requestId: string;
  constructor(requestId: string) {
    super(
      'The server may have created a session that this client did not ' +
        'receive. Run mcp_login again. The orphaned session (if any) ' +
        'expires on its own; to force revocation now, use the web ' +
        "dashboard's logout-everywhere.",
    );
    this.name = 'AuthOutcomeUnknownError';
    this.requestId = requestId;
  }
}

/**
 * Bounded POST — the production enforcement point for this policy
 * (auditor D1: the helpers must be wired, not just tested).
 *
 * Every in-scope HTTP call goes through here:
 *   - the per-request `timeout` in `config` bounds each attempt;
 *   - on a 429 carrying Retry-After, waits ONCE (bounded by
 *     RETRY_AFTER_CAP_MS) and retries ONCE, but only when the wait plus
 *     a second attempt still fits inside TOTAL_CALL_CAP_MS measured
 *     from the first attempt's start;
 *   - everything else is surfaced unchanged for the caller's
 *     terminal/retryable handling.
 */
export async function boundedPost<T>(
  url: string,
  body: unknown,
  config: { timeout?: number; headers?: Record<string, string> },
): Promise<{ data: T }> {
  const started = Date.now();
  try {
    return await axios.post<T>(url, body, config);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      const waitMs = boundedRetryAfterMs(
        (error.response.headers as Record<string, string> | undefined)?.['retry-after'],
      );
      const elapsed = Date.now() - started;
      const secondAttemptBudget = config.timeout ?? 0;
      if (waitMs > 0 && elapsed + waitMs + secondAttemptBudget <= TOTAL_CALL_CAP_MS) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return await axios.post<T>(url, body, config);
      }
    }
    throw error;
  }
}

const RETRYABLE_STATUSES = new Set([408, 409, 423, 425, 429]);
const TERMINAL_STATUSES = new Set([400, 401, 403, 404, 410, 422]);

export type HttpErrorClass = 'retryable' | 'terminal';

/**
 * Classify an axios error per the B5 table. Unknown 4xx statuses are
 * treated as terminal (fail-closed: no retry storms on unmodeled codes);
 * everything network-shaped is retryable.
 */
export function classifyHttpError(error: unknown): HttpErrorClass {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === undefined) return 'retryable'; // timeout / network
    if (status >= 500) return 'retryable';
    if (RETRYABLE_STATUSES.has(status)) return 'retryable';
    if (TERMINAL_STATUSES.has(status)) return 'terminal';
    return 'terminal';
  }
  return 'retryable';
}

/**
 * Parse a Retry-After header (seconds or HTTP-date) into a bounded wait
 * in ms: never negative, never above RETRY_AFTER_CAP_MS, 0 when absent
 * or unparseable.
 */
export function boundedRetryAfterMs(headerValue: string | undefined): number {
  if (!headerValue) return 0;
  let ms = 0;
  const secs = Number(headerValue);
  if (Number.isFinite(secs)) {
    ms = secs * 1000;
  } else {
    const date = Date.parse(headerValue);
    if (!Number.isNaN(date)) ms = date - Date.now();
  }
  if (ms < 0) ms = 0;
  if (ms > RETRY_AFTER_CAP_MS) ms = RETRY_AFTER_CAP_MS;
  return ms;
}
