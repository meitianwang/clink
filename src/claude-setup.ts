/**
 * Write Claude Code native config files so the `claude` subprocess
 * picks up rules and persona automatically.
 *
 * Global configs   → ~/.claude/settings.json, ~/.claude/rules/
 * Per-workspace    → <workspace>/CLAUDE.md
 */

import {
  chmodSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { execFile, execFileSync, spawn as nodeSpawn } from "node:child_process";
import type { ClaudeModelConfig } from "./types.js";

const CLAUDE_DIR = join(homedir(), ".claude");
const SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");
const RULES_DIR = join(CLAUDE_DIR, "rules");

// ---------------------------------------------------------------------------
// Global settings.json — full overwrite based on ClaudeModelConfig
// ---------------------------------------------------------------------------

/**
 * Delete and recreate ~/.claude/settings.json from scratch.
 * Official mode:    { model, skipDangerousModePermissionPrompt }
 * Third-party mode: { model, skipDangerousModePermissionPrompt, env: { ... } }
 */
export function writeClaudeSettings(cfg: ClaudeModelConfig): void {
  mkdirSync(CLAUDE_DIR, { recursive: true });

  // Delete old file first
  try {
    unlinkSync(SETTINGS_FILE);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }

  const modelValue = `${cfg.model}[1m]`;
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
    `[ClaudeSetup] settings.json written (mode=${cfg.mode}, model=${modelValue})`,
  );
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
 * Spawn `claude auth login` and capture the OAuth URL from output.
 * Returns a promise that resolves with the URL (or null if not found).
 * The child process is killed after 5 minutes or when URL is found.
 */
export function startClaudeLogin(): Promise<{ url: string | null }> {
  return new Promise((resolve) => {
    const child = nodeSpawn(getClaudeBin(), ["auth", "login"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "echo" },
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
        child.kill();
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

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        resolve({ url: null });
      }
    }, 300_000);
  });
}

// ---------------------------------------------------------------------------
// Global rules — ~/.claude/rules/*.md
// ---------------------------------------------------------------------------

interface RuleFile {
  filename: string;
  content: string;
}

/**
 * Write rule files to ~/.claude/rules/.
 * Each rule is a separate .md file.
 */
export function writeGlobalRules(rules: readonly RuleFile[]): void {
  mkdirSync(RULES_DIR, { recursive: true });
  for (const rule of rules) {
    // Prevent path traversal: filename must be a bare name, no slashes
    const safe = basename(rule.filename);
    if (safe !== rule.filename || rule.filename.includes("\\")) {
      throw new Error(`Invalid rule filename: ${rule.filename}`);
    }
    const filepath = join(RULES_DIR, safe);
    writeFileSync(filepath, rule.content);
    chmodSync(filepath, 0o600);
  }
  console.log(
    `[ClaudeSetup] Wrote ${rules.length} global rule(s) to ${RULES_DIR}`,
  );
}

// ---------------------------------------------------------------------------
// Per-workspace CLAUDE.md — persona system prompt
// ---------------------------------------------------------------------------

/**
 * Write CLAUDE.md in the workspace directory with the persona.
 * Only writes if the file doesn't exist or content has changed.
 */
export function writeWorkspacePersona(
  workspaceDir: string,
  persona: string,
): void {
  const claudeMdPath = join(workspaceDir, "CLAUDE.md");
  const content = persona.trim() + "\n";

  // Skip if unchanged
  if (existsSync(claudeMdPath)) {
    try {
      if (readFileSync(claudeMdPath, "utf-8") === content) return;
    } catch {
      // unreadable — overwrite
    }
  }

  writeFileSync(claudeMdPath, content);
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
