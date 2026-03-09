/**
 * Per-user memory store — aligned with OpenClaw's design.
 *
 * Directory layout (per user):
 *   ~/.klaus/memory/{memoryKey}/MEMORY.md          — curated long-term facts
 *   ~/.klaus/memory/{memoryKey}/memory/YYYY-MM-DD.md — daily append-only logs
 *
 * Design principles (from OpenClaw):
 *   - Memory is plain Markdown on disk. The model only "remembers" what gets written.
 *   - MEMORY.md (long-term) is loaded at session start for PRIVATE chats only.
 *   - Daily logs (today + yesterday) are always loaded.
 *   - The system prompt tells the agent WHERE files are and HOW to use them.
 *   - The agent uses Read/Grep/Edit/Write tools to access memory — no custom tools needed.
 *   - Memory flush: a silent agent turn is triggered periodically to persist context.
 *
 * Memory key isolation:
 *   "web:user1:sess2"   → "web__user1"      (Web — strip session suffix)
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMORY_ROOT = join(CONFIG_DIR, "memory");

function sanitize(raw: string): string {
  return raw
    .replace(/:/g, "__")
    .replace(/\.\./g, "_")
    .replace(/[^\w.\-]/g, "_");
}

/**
 * Extract user-level memory key from a session key.
 * Web sessions strip the per-conversation suffix so all conversations
 * of the same user share one memory directory.
 */
export function deriveMemoryKey(sessionKey: string): string {
  if (sessionKey.startsWith("web:")) {
    const parts = sessionKey.split(":");
    if (parts.length >= 3) {
      return sanitize(`${parts[0]}:${parts[1]}`);
    }
  }
  return sanitize(sessionKey);
}

/** Detect whether a session key represents a group/channel context. */
export function isGroupSession(sessionKey: string): boolean {
  return sessionKey.startsWith("group:");
}

function todayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdayDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function readFileSafe(path: string, maxBytes: number = 50_000): string {
  if (!existsSync(path)) return "";
  try {
    const content = readFileSync(path, "utf-8");
    return content.length > maxBytes
      ? content.slice(0, maxBytes) + "\n...(truncated)"
      : content;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Memory flush prompt (aligned with OpenClaw's pre-compaction flush)
// ---------------------------------------------------------------------------

/** Build the memory flush prompt with the current date (not cached). */
export function buildMemoryFlushPrompt(): string {
  return [
    "[系统] Pre-compaction memory flush.",
    `Store durable memories now. Today is ${todayDateStr()}.`,
    "- Write lasting facts/preferences/decisions to MEMORY.md (create if needed).",
    `- Write session notes/context to memory/${todayDateStr()}.md (APPEND only, do not overwrite).`,
    "- If the file already exists, APPEND new content; do not overwrite existing entries.",
    "- If nothing worth storing, reply with a single period (.).",
    "Do NOT mention this memory flush to the user. Just silently store memories and reply with a period.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------

export class MemoryStore {
  private readonly rootDir: string;
  /** Track which memory dirs have been initialized to avoid repeated mkdirSync. */
  private readonly initializedDirs = new Set<string>();

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? MEMORY_ROOT;
    mkdirSync(this.rootDir, { recursive: true });
  }

  /** Get the memory directory for a given session key. */
  getMemoryDir(sessionKey: string): string {
    const memKey = deriveMemoryKey(sessionKey);
    const dir = join(this.rootDir, memKey);
    if (!this.initializedDirs.has(memKey)) {
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, "memory"), { recursive: true });
      this.initializedDirs.add(memKey);
    }
    return dir;
  }

  /** Absolute path to MEMORY.md. */
  getLongTermPath(sessionKey: string): string {
    return join(this.getMemoryDir(sessionKey), "MEMORY.md");
  }

  /** Absolute path to a daily log file. */
  getDailyPath(sessionKey: string, date?: string): string {
    return join(
      this.getMemoryDir(sessionKey),
      "memory",
      `${date ?? todayDateStr()}.md`,
    );
  }

  /** Read long-term memory. */
  readLongTerm(sessionKey: string): string {
    return readFileSafe(this.getLongTermPath(sessionKey));
  }

  /** Read today's daily log. */
  readDailyToday(sessionKey: string): string {
    return readFileSafe(this.getDailyPath(sessionKey));
  }

  /** Read yesterday's daily log. */
  readDailyYesterday(sessionKey: string): string {
    return readFileSafe(this.getDailyPath(sessionKey, yesterdayDateStr()));
  }

  /**
   * Build the memory section for the system prompt.
   *
   * Aligned with OpenClaw:
   * - MEMORY.md content is injected only for private chats (not groups).
   * - Daily logs (today + yesterday) are always injected.
   * - System prompt includes paths and mandatory recall instructions.
   */
  buildMemoryPrompt(sessionKey: string): string {
    const memDir = this.getMemoryDir(sessionKey);
    const isGroup = isGroupSession(sessionKey);

    const longTerm = isGroup ? "" : this.readLongTerm(sessionKey);
    const today = this.readDailyToday(sessionKey);
    const yesterday = this.readDailyYesterday(sessionKey);

    const longTermPath = this.getLongTermPath(sessionKey);
    const dailyPath = this.getDailyPath(sessionKey);
    const dailyDir = join(memDir, "memory");

    const lines: string[] = [];

    // --- Section: Memory Recall (mandatory instructions) ---
    lines.push("## Memory");
    lines.push("");
    lines.push("### Memory Recall (mandatory)");
    lines.push(
      "Before answering anything about prior conversations, decisions, dates, people, preferences, or todos: " +
        `search memory files first. Use the Grep tool to search in \`${dailyDir}\` for keywords, ` +
        `or use the Read tool to read \`${longTermPath}\`. ` +
        "If low confidence after search, tell the user you checked but didn't find anything.",
    );
    lines.push("");

    // --- Section: Memory Paths ---
    lines.push("### Memory Files");
    lines.push(`- Long-term memory: \`${longTermPath}\``);
    lines.push(`- Daily logs directory: \`${dailyDir}\``);
    lines.push(`- Today's log: \`${dailyPath}\``);
    lines.push("");

    // --- Section: When to write ---
    lines.push("### When to Write Memory");
    lines.push(
      "- **MEMORY.md**: Decisions, preferences, durable facts (name, projects, contacts). Use Write or Edit tool.",
    );
    lines.push(
      `- **memory/${todayDateStr()}.md**: Running notes, day-to-day context. APPEND only — never overwrite existing entries.`,
    );
    lines.push('- If someone says "remember this" — write it immediately.');
    lines.push(
      "- When important information emerges during conversation — proactively save it.",
    );
    lines.push("");

    // --- Section: Current memory contents ---
    const hasContent = longTerm || today || yesterday;
    if (hasContent) {
      lines.push("### Current Memory");
      lines.push("");

      if (longTerm) {
        lines.push("#### MEMORY.md");
        lines.push("```markdown");
        lines.push(longTerm.trim());
        lines.push("```");
        lines.push("");
      }

      if (today) {
        lines.push(`#### ${todayDateStr()}.md (today)`);
        lines.push("```markdown");
        lines.push(today.trim());
        lines.push("```");
        lines.push("");
      }

      if (yesterday) {
        lines.push(`#### ${yesterdayDateStr()}.md (yesterday)`);
        lines.push("```markdown");
        lines.push(yesterday.trim());
        lines.push("```");
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}
