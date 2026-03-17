/**
 * Local token for macOS app ↔ daemon authentication.
 *
 * On daemon start, a random token is written to ~/.klaus/local.token (mode 0o600).
 * The macOS app reads this file and sends it via WebSocket to bypass cookie auth.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";

const TOKEN_FILE = join(CONFIG_DIR, "local.token");
const EXEC_TOKEN_FILE = join(CONFIG_DIR, "exec.token");
let activeToken: string | null = null;

/**
 * Generate and persist a local token. Called once on daemon start.
 */
export function generateLocalToken(): string {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const token = randomBytes(32).toString("hex");
  writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  activeToken = token;
  return token;
}

/**
 * Validate a token against the active local token using timing-safe comparison.
 */
export function validateLocalToken(token: string): boolean {
  if (!activeToken || !token) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(activeToken);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Generate and persist an exec approval token for the macOS app's Unix socket.
 */
export function generateExecToken(): string {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const token = randomBytes(24).toString("base64");
  writeFileSync(EXEC_TOKEN_FILE, token, { mode: 0o600 });
  return token;
}
