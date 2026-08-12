/**
 * Per-call gRPC deadline options (hardening plan Fix 1).
 * Standard operations: 30 s. Heavy analysis-class operations: 120 s.
 * Applied per attempt (a retry gets a fresh deadline).
 */
import { GRPC_HEAVY_DEADLINE_MS, GRPC_STANDARD_DEADLINE_MS } from '../config/httpPolicy.js';

export function standardDeadline(): { deadline: Date } {
  return { deadline: new Date(Date.now() + GRPC_STANDARD_DEADLINE_MS) };
}

export function heavyDeadline(): { deadline: Date } {
  return { deadline: new Date(Date.now() + GRPC_HEAVY_DEADLINE_MS) };
}
