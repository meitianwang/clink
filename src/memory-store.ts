/**
 * Per-user memory store.
 *
 * Directory layout (per user):
 *   ~/.klaus/memory/{memoryKey}/MEMORY.md          — sectioned long-term facts
 *   ~/.klaus/memory/{memoryKey}/memory/YYYY-MM-DD.md — daily append-only logs
 *
 * MEMORY.md uses `## Section` headings to organize facts by topic.
 * The agent uses Edit tool to update entries in-place (not append).
 * Periodic flush compresses and deduplicates sections.
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

/**
 * Max characters to inject from MEMORY.md into the system prompt.
 * Sectioned format should keep it well under this, but cap as safety net.
 */
const MEMORY_MAX_CHARS = 8_000;

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
function deriveMemoryKey(sessionKey: string): string {
  if (sessionKey.startsWith("web:")) {
    const parts = sessionKey.split(":");
    if (parts.length >= 3) {
      return sanitize(`${parts[0]}:${parts[1]}`);
    }
  }
  return sanitize(sessionKey);
}

/** Detect whether a session key represents a group/channel context. */
function isGroupSession(sessionKey: string): boolean {
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
// Memory flush prompt
// ---------------------------------------------------------------------------

/** Build the memory flush prompt with the current date (not cached). */
export function buildMemoryFlushPrompt(): string {
  return [
    "[系统] Pre-compaction memory flush.",
    `Store durable memories now. Today is ${todayDateStr()}.`,
    "",
    "MEMORY.md rules:",
    "- Use `## Section` headings to organize by topic (e.g. ## 个人信息, ## 饮食, ## 家人).",
    "- Each section contains bullet-point facts, one fact per line, concise.",
    "- UPDATE existing entries when information changes (use Edit tool), do not duplicate.",
    "- REMOVE outdated entries instead of keeping both old and new.",
    "- If a section exceeds ~15 lines, consolidate: merge related items, drop trivial details.",
    "- Total file should stay under ~50 lines. If it's longer, compress aggressively.",
    "- Do NOT create separate files. All long-term memory goes in MEMORY.md.",
    "",
    `Daily log rules:`,
    `- Write session notes/context to memory/${todayDateStr()}.md (APPEND only).`,
    "- If nothing worth storing, reply with a single period (.).",
    "",
    "Do NOT mention this memory flush to the user. Silently store memories and reply with a period.",
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
    return readFileSafe(this.getLongTermPath(sessionKey), MEMORY_MAX_CHARS);
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
   * - MEMORY.md (sectioned facts) is injected for private chats only.
   * - Daily logs (today + yesterday) are always injected.
   * - Prompt instructs agent to use Edit for updates, not append.
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

    // --- Section: Memory instructions ---
    lines.push("## Memory");
    lines.push("");

    lines.push("### Recall");
    lines.push(
      "Before answering questions about prior conversations, preferences, people, or plans: " +
        "check the memory content below first. " +
        `For older history, use Grep to search in \`${dailyDir}\`.`,
    );
    lines.push("");

    lines.push("### How to Remember");
    lines.push(`- Long-term facts → \`${longTermPath}\``);
    lines.push(
      "  - Organize with `## Section` headings (e.g. ## 个人信息, ## 喜好, ## 家人).",
    );
    lines.push(
      "  - Bullet-point facts, one per line, concise. Update in-place with Edit tool when info changes.",
    );
    lines.push(
      "  - Do NOT create new files. All durable memory goes in this single file.",
    );
    lines.push(`- Daily notes → \`${dailyPath}\` (append only)`);
    lines.push(
      '- When the user says "记住" / "remember" → write immediately.',
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
