/**
 * Write Claude Code native config files so the `claude` subprocess
 * picks up model, permissions, rules, and persona automatically
 * — no CLI arguments needed.
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
} from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const CLAUDE_DIR = join(homedir(), ".claude");
const SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");
const RULES_DIR = join(CLAUDE_DIR, "rules");

// ---------------------------------------------------------------------------
// Global settings.json — model + permissions
// ---------------------------------------------------------------------------

interface KlausGlobalSettings {
  model?: string;
  permissions?: {
    defaultMode?: string;
    allow?: string[];
    deny?: string[];
  };
}

/**
 * Merge Klaus-managed keys into ~/.claude/settings.json.
 * Preserves any user-added keys (theme, env, etc.).
 */
export function writeGlobalSettings(opts: KlausGlobalSettings): void {
  mkdirSync(CLAUDE_DIR, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(SETTINGS_FILE)) {
    try {
      existing = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
    } catch {
      // corrupted — overwrite
    }
  }

  if (opts.model) {
    existing.model = opts.model;
  }
  if (opts.permissions) {
    existing.permissions = opts.permissions;
  }

  writeFileSync(SETTINGS_FILE, JSON.stringify(existing, null, 2) + "\n");
  chmodSync(SETTINGS_FILE, 0o600);
  console.log("[ClaudeSetup] Global settings.json updated");
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
// Convenience: initialize all global configs at Klaus startup
// ---------------------------------------------------------------------------

export interface ClaudeSetupOptions {
  model?: string;
  permissions?: KlausGlobalSettings["permissions"];
  rules?: readonly RuleFile[];
}

export function initGlobalClaudeConfig(opts: ClaudeSetupOptions): void {
  writeGlobalSettings({
    model: opts.model,
    permissions: opts.permissions,
  });

  if (opts.rules && opts.rules.length > 0) {
    writeGlobalRules(opts.rules);
  }

  // Resolve and cache the absolute path to the `claude` binary so
  // child_process.spawn works reliably even when PATH differs
  // (e.g. launchd/daemon mode).
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
