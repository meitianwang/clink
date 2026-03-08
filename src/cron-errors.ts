/**
 * Cron error classification: transient vs permanent.
 *
 * Transient errors are retryable (rate limit, network, server errors).
 * Permanent errors should disable the task immediately.
 */

export type CronErrorKind = "transient" | "permanent";

const TRANSIENT_PATTERNS = [
  "rate_limit",
  "rate limit",
  "429",
  "too many requests",
  "timeout",
  "timed out",
  "econnreset",
  "econnrefused",
  "enotfound",
  "fetch failed",
  "socket hang up",
  "network",
  "resource exhausted",
  "service unavailable",
  "503",
  "502",
  " 500",
  "status 500",
  "http 500",
  "internal server error",
  "bad gateway",
  "gateway timeout",
  "504",
];

const PERMANENT_PATTERNS = [
  "invalid api key",
  "unauthorized",
  "authentication",
  "403",
  "forbidden",
  "not_found_error",
  "invalid_request",
  "permission denied",
];

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.toLowerCase();
  return String(err).toLowerCase();
}

export function classifyCronError(err: unknown): CronErrorKind {
  const msg = getErrorMessage(err);

  for (const pattern of PERMANENT_PATTERNS) {
    if (msg.includes(pattern)) return "permanent";
  }

  for (const pattern of TRANSIENT_PATTERNS) {
    if (msg.includes(pattern)) return "transient";
  }

  // Default: treat unknown errors as transient (safer — allows retry)
  return "transient";
}

export function isTransientError(err: unknown): boolean {
  return classifyCronError(err) === "transient";
}
