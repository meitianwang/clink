/**
 * Message persistence: appends user/assistant messages as JSONL transcripts.
 * Each sessionKey maps to one `.jsonl` file under ~/.klaus/transcripts/.
 *
 * Format (one JSON object per line):
 *   {"type":"session","sessionKey":"web:abc:uuid","createdAt":1709654400000}
 *   {"type":"message","role":"user","content":"hello","ts":1709654401000}
 *   {"type":"message","role":"assistant","content":"hi!","ts":1709654405000}
 *
 * Inspired by OpenClaw's JSONL transcript approach, simplified for Klaus
 * (no parentId chains, no compaction, no vector DB).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { appendFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";
import type { TranscriptsConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptSessionLine {
  readonly type: "session";
  readonly sessionKey: string;
  readonly createdAt: number;
}

interface TranscriptMessage {
  readonly type: "message";
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly ts: number;
}

interface SessionSummary {
  readonly sessionId: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messageCount: number;
}

type TranscriptLine = TranscriptSessionLine | TranscriptMessage;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULTS: TranscriptsConfig = {
  transcriptsDir: join(CONFIG_DIR, "transcripts"),
  maxFiles: 200,
  maxAgeDays: 30,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace `:` with `__` and strip unsafe chars for use as filename. */
function sanitizeSessionKey(sessionKey: string): string {
  return sessionKey
    .replace(/:/g, "__")
    .replace(/\.\./g, "_") // prevent path traversal
    .replace(/[^\w.\-]/g, "_");
}

function parseSummary(raw: string, sessionId: string): SessionSummary | null {
  let createdAt = 0;
  let updatedAt = 0;
  let title = "New Chat";
  let messageCount = 0;
  let foundFirstUser = false;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.type === "session" && typeof parsed.createdAt === "number") {
        createdAt = parsed.createdAt;
      }
      if (parsed.type === "message") {
        messageCount++;
        const ts = typeof parsed.ts === "number" ? parsed.ts : 0;
        if (ts > updatedAt) updatedAt = ts;
        if (
          !foundFirstUser &&
          parsed.role === "user" &&
          typeof parsed.content === "string"
        ) {
          title = parsed.content.slice(0, 50).trim() || "New Chat";
          foundFirstUser = true;
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (messageCount === 0) return null;
  return {
    sessionId,
    title,
    createdAt: createdAt || updatedAt,
    updatedAt,
    messageCount,
  };
}

function parseMessages(raw: string): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (
        parsed.type === "message" &&
        (parsed.role === "user" || parsed.role === "assistant") &&
        typeof parsed.content === "string"
      ) {
        messages.push({
          type: "message",
          role: parsed.role,
          content: parsed.content,
          ts: typeof parsed.ts === "number" ? parsed.ts : 0,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }
  return messages;
}

// ---------------------------------------------------------------------------
// MessageStore
// ---------------------------------------------------------------------------

export class MessageStore {
  private readonly config: TranscriptsConfig;
  /** Tracks which sessionKeys already have a file (avoids repeated existsSync). */
  private readonly knownFiles = new Set<string>();
  /** Per-key write locks to prevent concurrent header/append races. */
  private readonly writeLocks = new Map<string, Promise<void>>();

  constructor(config?: Partial<TranscriptsConfig>) {
    this.config = { ...DEFAULTS, ...config };
    mkdirSync(this.config.transcriptsDir, { recursive: true });
  }

  /** Resolve the JSONL file path for a given sessionKey. */
  private filePath(sessionKey: string): string {
    return join(
      this.config.transcriptsDir,
      sanitizeSessionKey(sessionKey) + ".jsonl",
    );
  }

  /** Write the session header and line data (actual I/O, no locking). */
  private async doAppend(
    sessionKey: string,
    line: TranscriptLine,
  ): Promise<void> {
    const fp = this.filePath(sessionKey);

    // Write session header on first append
    if (!this.knownFiles.has(sessionKey)) {
      if (!existsSync(fp)) {
        const header: TranscriptSessionLine = {
          type: "session",
          sessionKey,
          createdAt: Date.now(),
        };
        await appendFile(fp, JSON.stringify(header) + "\n", "utf-8");
      }
      this.knownFiles.add(sessionKey);
    }

    await appendFile(fp, JSON.stringify(line) + "\n", "utf-8");
  }

  /** Ensure the session header line exists, then append a transcript line. */
  private appendLine(sessionKey: string, line: TranscriptLine): Promise<void> {
    // Serialize writes per sessionKey to prevent concurrent header races
    const prev = this.writeLocks.get(sessionKey) ?? Promise.resolve();
    const next = prev.then(() => this.doAppend(sessionKey, line));
    this.writeLocks.set(
      sessionKey,
      next.catch(() => {}),
    );
    return next;
  }

  /** Append a user or assistant message to the session's transcript. */
  async append(
    sessionKey: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    const line: TranscriptMessage = {
      type: "message",
      role,
      content,
      ts: Date.now(),
    };
    await this.appendLine(sessionKey, line);
  }

  /** Read all messages from a session's transcript (empty array if none). */
  async readHistory(sessionKey: string): Promise<readonly TranscriptMessage[]> {
    const fp = this.filePath(sessionKey);
    if (!existsSync(fp)) return [];

    const raw = await readFile(fp, "utf-8");
    return parseMessages(raw);
  }

  /** Prune old transcript files by age and count. Returns number of files removed. */
  prune(): number {
    const dir = this.config.transcriptsDir;
    if (!existsSync(dir)) return 0;

    const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let removed = 0;

    // Collect all .jsonl files with mtime
    const files: Array<{ name: string; mtimeMs: number }> = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      try {
        const st = statSync(join(dir, name));
        files.push({ name, mtimeMs: st.mtimeMs });
      } catch {
        // Skip unreadable files
      }
    }

    // Remove files older than maxAge
    const remaining: typeof files = [];
    for (const f of files) {
      if (now - f.mtimeMs > maxAgeMs) {
        try {
          unlinkSync(join(dir, f.name));
          removed++;
        } catch {
          remaining.push(f);
        }
      } else {
        remaining.push(f);
      }
    }

    // Cap total file count (keep newest)
    if (remaining.length > this.config.maxFiles) {
      remaining.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
      const excess = remaining.slice(this.config.maxFiles);
      for (const f of excess) {
        try {
          unlinkSync(join(dir, f.name));
          removed++;
        } catch {
          // Ignore
        }
      }
    }

    if (removed > 0) {
      console.log(`[MessageStore] Pruned ${removed} transcript file(s)`);
    }

    return removed;
  }

  /**
   * List all sessions whose sanitized sessionKey starts with the given prefix.
   * Returns summaries sorted by updatedAt descending (newest first).
   * Capped at `limit` results (default 200).
   */
  async listSessions(
    prefix: string,
    limit: number = 200,
  ): Promise<readonly SessionSummary[]> {
    const dir = this.config.transcriptsDir;

    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }

    const sanitizedPrefix = sanitizeSessionKey(prefix);
    const matching = names.filter(
      (n) => n.endsWith(".jsonl") && n.startsWith(sanitizedPrefix),
    );

    const tasks = matching.map(async (name) => {
      const sessionId = name.slice(sanitizedPrefix.length, -".jsonl".length);
      if (!sessionId) return null;
      try {
        const raw = await readFile(join(dir, name), "utf-8");
        return parseSummary(raw, sessionId);
      } catch {
        return null;
      }
    });

    const results = (await Promise.all(tasks)).filter(
      (s): s is SessionSummary => s !== null,
    );
    results.sort((a, b) => b.updatedAt - a.updatedAt);
    return results.slice(0, limit);
  }

  /** Delete a session's transcript file. */
  deleteSession(sessionKey: string): boolean {
    const fp = this.filePath(sessionKey);
    if (!existsSync(fp)) return false;
    try {
      unlinkSync(fp);
      this.knownFiles.delete(sessionKey);
      this.writeLocks.delete(sessionKey);
      return true;
    } catch (err) {
      console.error("[MessageStore] Failed to delete transcript:", fp, err);
      return false;
    }
  }

  /** No-op for now; async file writes are self-contained. */
  close(): void {
    // Reserved for future use
  }
}
