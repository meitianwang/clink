/**
 * Cron webhook utilities: SSRF validation + shared HTTP POST helper.
 *
 * Extracted from CronScheduler to keep cron.ts focused on scheduling logic.
 */

// SSRF prevention: blocked hosts for webhook delivery
const BLOCKED_WEBHOOK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254", // AWS IMDS
  "metadata.google.internal",
]);

/** Validate URL format and block internal/private addresses (SSRF prevention). */
function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid webhook URL: "${url}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid webhook URL protocol: "${parsed.protocol}"`);
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_WEBHOOK_HOSTS.has(host)) {
    throw new Error(`Webhook URL blocked (internal address): "${host}"`);
  }
  // Block RFC-1918 / link-local ranges
  if (
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("169.254.")
  ) {
    throw new Error(`Webhook URL blocked (private network): "${host}"`);
  }
}

/**
 * POST JSON payload to a webhook URL with optional Bearer token.
 * Validates URL for SSRF before sending.
 */
export async function postWebhook(
  url: string,
  payload: Record<string, unknown>,
  token?: string,
  timeoutMs: number = 10_000,
): Promise<void> {
  validateWebhookUrl(url);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Webhook POST failed: ${response.status} ${response.statusText}`,
    );
  }
}
