/**
 * Deterministic stagger for top-of-hour cron expressions.
 *
 * Prevents thundering herd when multiple tasks fire at the same minute.
 * Uses SHA-256 hash of job ID for stable, per-job offset.
 */

import { createHash } from "node:crypto";

const DEFAULT_MAX_STAGGER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a cron expression is a recurring top-of-hour pattern.
 * Matches patterns like "0 * * * *", "0 *​/2 * * *" but NOT "0 7 * * *".
 */
function isRecurringTopOfHourExpr(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  // 5-field: min hour dom month dow
  // 6-field: sec min hour dom month dow
  if (parts.length < 5 || parts.length > 6) return false;

  const minuteIdx = parts.length === 6 ? 1 : 0;
  const hourIdx = parts.length === 6 ? 2 : 1;

  const minute = parts[minuteIdx];
  const hour = parts[hourIdx];

  // Minute must be "0" (top of hour)
  if (minute !== "0") return false;

  // Hour must be wildcard-based: "*", "*/N"
  if (hour === "*" || /^\*\/\d+$/.test(hour)) return true;

  return false;
}

/**
 * Compute a deterministic stagger offset from a job ID.
 * Returns a value in [0, maxMs) that is stable for the same jobId.
 */
function computeStaggerMs(
  jobId: string,
  maxMs: number = DEFAULT_MAX_STAGGER_MS,
): number {
  const hash = createHash("sha256").update(jobId).digest();
  // Read first 4 bytes as unsigned 32-bit integer
  const value = hash.readUInt32BE(0);
  return value % maxMs;
}

/**
 * Resolve the effective stagger for a task.
 *
 * - explicitStagger === 0 → exact timing (no stagger)
 * - explicitStagger > 0 → use as max stagger window
 * - explicitStagger === undefined → auto-detect from expression
 */
export function resolveStaggerMs(
  schedule: string | { readonly kind: string; readonly expr?: string },
  jobId: string,
  explicitStagger?: number,
): number {
  // Explicit override
  if (explicitStagger !== undefined) {
    if (explicitStagger <= 0) return 0;
    return computeStaggerMs(jobId, explicitStagger);
  }

  // Auto-detect: only for cron expressions
  let expr: string | undefined;
  if (typeof schedule === "string") {
    expr = schedule;
  } else if (schedule.kind === "cron" && schedule.expr) {
    expr = schedule.expr;
  }

  if (expr && isRecurringTopOfHourExpr(expr)) {
    return computeStaggerMs(jobId, DEFAULT_MAX_STAGGER_MS);
  }

  return 0;
}
