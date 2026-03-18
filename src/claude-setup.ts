/**
 * Write Claude Code config to Klaus's own directory (~/.klaus/) so the
 * `claude` subprocess picks up settings via `--settings` flag.
 *
 * This avoids touching ~/.claude/ which belongs to the user's own Claude Code.
 */

import {
  chmodSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { execFile, execFileSync, spawn as nodeSpawn } from "node:child_process";
import { CONFIG_DIR } from "./config.js";
import type { ClaudeModelConfig } from "./types.js";

const SETTINGS_FILE = join(CONFIG_DIR, "claude-settings.json");

// ---------------------------------------------------------------------------
// Klaus settings — full overwrite based on ClaudeModelConfig
// ---------------------------------------------------------------------------

/**
 * Write ~/.klaus/claude-settings.json from scratch.
 */
export function writeClaudeSettings(cfg: ClaudeModelConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });

  const modelValue = cfg.model;
  const settings: Record<string, unknown> = {
    model: modelValue,
    skipDangerousModePermissionPrompt: true,
  };

  if (cfg.mode === "thirdparty") {
    const env: Record<string, string> = {};
    if (cfg.authToken) env.ANTHROPIC_AUTH_TOKEN = cfg.authToken;
    if (cfg.baseUrl) env.ANTHROPIC_BASE_URL = cfg.baseUrl;
    if (cfg.modelMap?.haiku)
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = cfg.modelMap.haiku;
    if (cfg.modelMap?.opus)
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = cfg.modelMap.opus;
    if (cfg.modelMap?.sonnet)
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = cfg.modelMap.sonnet;
    if (cfg.apiTimeoutMs)
      env.API_TIMEOUT_MS = String(cfg.apiTimeoutMs);
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
    settings.env = env;
  }

  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  chmodSync(SETTINGS_FILE, 0o600);
  console.log(
    `[ClaudeSetup] claude-settings.json written (mode=${cfg.mode}, model=${modelValue})`,
  );
}

/**
 * Return the path to Klaus's claude-settings.json (for --settings flag).
 */
export function getClaudeSettingsPath(): string {
  return SETTINGS_FILE;
}

// ---------------------------------------------------------------------------
// Auth helpers — check login status, trigger login flow
// ---------------------------------------------------------------------------

interface ClaudeAuthStatus {
  loggedIn: boolean;
  email?: string;
}

/**
 * Check Claude CLI auth status by running `claude auth status`.
 * Async to avoid blocking the event loop.
 */
export function readClaudeAuthStatus(): Promise<ClaudeAuthStatus> {
  return new Promise((resolve) => {
    execFile(
      getClaudeBin(),
      ["auth", "status"],
      { encoding: "utf-8", timeout: 10_000 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ loggedIn: false });
          return;
        }
        const output = stdout + stderr;
        const emailMatch = output.match(/[Ll]ogged in as\s+(\S+@\S+)/);
        if (emailMatch) {
          resolve({ loggedIn: true, email: emailMatch[1] });
          return;
        }
        if (!/not logged in|error/i.test(output)) {
          resolve({ loggedIn: true });
          return;
        }
        resolve({ loggedIn: false });
      },
    );
  });
}

/**
 * Spawn `claude auth login` and capture the OAuth URL.
 * The child process stays alive — the CLI polls until the user
 * completes OAuth in their browser.
 * Killed after 5 minutes if still running.
 */
export function startClaudeLogin(): Promise<{ url: string | null }> {
  return new Promise((resolve) => {
    const child = nodeSpawn(getClaudeBin(), ["auth", "login"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let resolved = false;
    let output = "";
    const MAX_BUF = 8192;

    const tryExtractUrl = (data: string) => {
      output += data;
      if (output.length > MAX_BUF) output = output.slice(-MAX_BUF);
      const urlMatch = output.match(/https:\/\/\S+/);
      if (urlMatch && !resolved) {
        resolved = true;
        resolve({ url: urlMatch[0] });
      }
    };

    child.stdout.on("data", (chunk: Buffer) => tryExtractUrl(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => tryExtractUrl(chunk.toString()));

    child.on("close", () => {
      if (!resolved) {
        resolved = true;
        resolve({ url: null });
      }
    });

    setTimeout(() => {
      child.kill();
      if (!resolved) {
        resolved = true;
        resolve({ url: null });
      }
    }, 300_000);
  });
}

// ---------------------------------------------------------------------------
// Resolve and cache the `claude` binary path at startup
// ---------------------------------------------------------------------------

export function resolveAndCacheClaudeBin(): void {
  resolveClaudeBinary();
}

// ---------------------------------------------------------------------------
// Claude binary resolution — cached absolute path
// ---------------------------------------------------------------------------

let cachedClaudeBin: string | undefined;

/**
 * Resolve the absolute path to the `claude` CLI binary.
 * Caches the result for the lifetime of the process.
 */
function resolveClaudeBinary(): void {
  if (cachedClaudeBin) return;
  try {
    cachedClaudeBin = execFileSync("which", ["claude"], {
      encoding: "utf-8",
    }).trim();
    console.log(`[ClaudeSetup] Resolved claude binary: ${cachedClaudeBin}`);
  } catch {
    console.warn(
      "[ClaudeSetup] Could not resolve claude binary path; falling back to PATH lookup",
    );
  }
}

/**
 * Return the resolved absolute path to `claude`, or the bare command name
 * as fallback (relies on PATH).
 */
export function getClaudeBin(): string {
  return cachedClaudeBin ?? "claude";
}
