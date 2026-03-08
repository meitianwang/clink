/**
 * Cron run log: JSONL-based per-job run history.
 *
 * Each job gets its own file at `~/.klaus/cron/runs/<jobId>.jsonl`.
 * Auto-prunes when file exceeds maxBytes by keeping newest keepLines.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { CONFIG_DIR } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CronRunLogEntry {
  readonly ts: number;
  readonly jobId: string;
  readonly action: "finished";
  readonly status: "ok" | "error" | "skipped";
  readonly error?: string;
  readonly summary?: string;
  readonly durationMs: number;
  readonly model?: string;
  readonly delivered?: boolean;
  readonly deliveryStatus?: "delivered" | "not-delivered" | "not-requested";
  readonly deliveryError?: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_BASE_DIR = join(CONFIG_DIR, "cron", "runs");
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_KEEP_LINES = 2000;

// Job ID safety: only allow alphanumeric, dash, underscore, dot
const SAFE_ID_RE = /^[a-zA-Z0-9._-]+$/;

// ---------------------------------------------------------------------------
// CronRunLog
// ---------------------------------------------------------------------------

export class CronRunLog {
  private readonly baseDir: string;
  private readonly maxBytes: number;
  private readonly keepLines: number;

  constructor(opts?: {
    baseDir?: string;
    maxBytes?: number;
    keepLines?: number;
  }) {
    this.baseDir = opts?.baseDir ?? DEFAULT_BASE_DIR;
    this.maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
    this.keepLines = opts?.keepLines ?? DEFAULT_KEEP_LINES;
    mkdirSync(this.baseDir, { recursive: true });
  }

  /** Append a run log entry and prune if file is too large. */
  append(entry: CronRunLogEntry): void {
    const filePath = this.getFilePath(entry.jobId);
    mkdirSync(dirname(filePath), { recursive: true });

    const line = JSON.stringify(entry) + "\n";
    appendFileSync(filePath, line, "utf-8");

    this.pruneIfNeeded(filePath);
  }

  /** Read the most recent N entries for a job. */
  read(jobId: string, limit: number = 20): CronRunLogEntry[] {
    const filePath = this.getFilePath(jobId);
    if (!existsSync(filePath)) return [];

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries: CronRunLogEntry[] = [];

    // Read from end (most recent first)
    const start = Math.max(0, lines.length - limit);
    for (let i = lines.length - 1; i >= start; i--) {
      try {
        entries.push(JSON.parse(lines[i]) as CronRunLogEntry);
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }

  /** Delete log file for a job. */
  deleteJob(jobId: string): void {
    const filePath = this.getFilePath(jobId);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  private getFilePath(jobId: string): string {
    if (!SAFE_ID_RE.test(jobId)) {
      throw new Error(`Unsafe cron job ID: "${jobId}"`);
    }
    return join(this.baseDir, `${jobId}.jsonl`);
  }

  /** Prune file if it exceeds maxBytes: keep only the newest keepLines. */
  private pruneIfNeeded(filePath: string): void {
    try {
      const stat = statSync(filePath);
      if (stat.size <= this.maxBytes) return;

      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      if (lines.length <= this.keepLines) return;

      // Keep newest lines
      const kept = lines.slice(-this.keepLines);
      const tmpPath = filePath + ".tmp";
      writeFileSync(tmpPath, kept.join("\n") + "\n", "utf-8");
      renameSync(tmpPath, filePath);

      console.log(
        `[CronLog] Pruned ${filePath}: ${lines.length} → ${kept.length} lines`,
      );
    } catch (err) {
      console.error("[CronLog] Prune failed:", err);
    }
  }
}
