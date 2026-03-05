/**
 * Session persistence: saves Claude SDK session IDs to SQLite
 * (~/.klaus/klaus.db) so conversations can be resumed after process restart.
 *
 * Design: direct SQLite reads/writes with WAL mode for crash safety.
 * Claude SDK maintains conversation history server-side; we only persist
 * the session ID (resume token).
 *
 * Migration: on first run, imports data from legacy sessions.json and
 * removes the JSON file.
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType, Statement } from "better-sqlite3";
import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONFIG_DIR } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistedSession {
  readonly sessionId: string;
  readonly sessionKey: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly model?: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_IDLE_MS = 4 * 60 * 60 * 1000; // 4 hours
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_MAX_ENTRIES = 100;

export { DEFAULT_IDLE_MS, DEFAULT_MAX_AGE_MS, DEFAULT_MAX_ENTRIES };

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CURRENT_SCHEMA_VERSION = 1;

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    session_key  TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    model        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
    ON sessions(updated_at);
`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface DbRow {
  session_key: string;
  session_id: string;
  created_at: number;
  updated_at: number;
  model: string | null;
}

function rowToSession(row: DbRow): PersistedSession {
  return {
    sessionKey: row.session_key,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.model ? { model: row.model } : {}),
  };
}

// ---------------------------------------------------------------------------
// SessionStore
// ---------------------------------------------------------------------------

export class SessionStore {
  private readonly db: DatabaseType;
  private readonly dbPath: string;
  private readonly jsonPath: string;

  // Pre-compiled statements
  private readonly stmtGet: Statement;
  private readonly stmtSet: Statement;
  private readonly stmtDelete: Statement;
  private readonly stmtPrune: Statement;
  private readonly stmtCap: Statement;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? join(CONFIG_DIR, "klaus.db");
    this.jsonPath = join(CONFIG_DIR, "sessions.json");

    mkdirSync(dirname(this.dbPath), { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");

    this.db.exec(INIT_SQL);

    // Set schema version on first creation
    const row = this.db
      .prepare("SELECT version FROM schema_version LIMIT 1")
      .get() as { version: number } | undefined;
    if (!row) {
      this.db
        .prepare("INSERT INTO schema_version (version) VALUES (?)")
        .run(CURRENT_SCHEMA_VERSION);
    }

    // Pre-compile statements
    this.stmtGet = this.db.prepare(
      "SELECT session_key, session_id, created_at, updated_at, model FROM sessions WHERE session_key = ?",
    );
    this.stmtSet = this.db.prepare(`
      INSERT INTO sessions (session_key, session_id, created_at, updated_at, model)
      VALUES (@sessionKey, @sessionId, @createdAt, @updatedAt, @model)
      ON CONFLICT(session_key) DO UPDATE SET
        session_id = @sessionId,
        updated_at = @updatedAt,
        model = @model
    `);
    this.stmtDelete = this.db.prepare(
      "DELETE FROM sessions WHERE session_key = ?",
    );
    this.stmtPrune = this.db.prepare(
      "DELETE FROM sessions WHERE updated_at < ?",
    );
    this.stmtCap = this.db.prepare(`
      DELETE FROM sessions WHERE session_key NOT IN (
        SELECT session_key FROM sessions ORDER BY updated_at DESC LIMIT ?
      )
    `);

    // Best-effort file permissions
    try {
      chmodSync(this.dbPath, 0o600);
    } catch {
      /* ignore */
    }
  }

  // -- Lifecycle ------------------------------------------------------------

  async load(): Promise<void> {
    await this.migrateFromJson();
  }

  async save(): Promise<void> {
    // No-op: SQLite WAL mode writes are immediate
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // -- CRUD -----------------------------------------------------------------

  get(sessionKey: string): PersistedSession | undefined {
    const row = this.stmtGet.get(sessionKey) as DbRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  set(sessionKey: string, entry: PersistedSession): void {
    this.stmtSet.run({
      sessionKey: entry.sessionKey,
      sessionId: entry.sessionId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      model: entry.model ?? null,
    });
  }

  delete(sessionKey: string): void {
    this.stmtDelete.run(sessionKey);
  }

  // -- Queries --------------------------------------------------------------

  isFresh(sessionKey: string, idleMs: number = DEFAULT_IDLE_MS): boolean {
    const entry = this.get(sessionKey);
    if (!entry) return false;
    return Date.now() - entry.updatedAt < idleMs;
  }

  // -- Maintenance ----------------------------------------------------------

  pruneStale(maxAgeMs: number = DEFAULT_MAX_AGE_MS): number {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return 0;
    const cutoff = Date.now() - maxAgeMs;
    const result = this.stmtPrune.run(cutoff);
    if (result.changes > 0) {
      console.log(`[SessionStore] Pruned ${result.changes} stale session(s)`);
    }
    return result.changes;
  }

  capEntries(maxEntries: number = DEFAULT_MAX_ENTRIES): number {
    if (!Number.isFinite(maxEntries) || maxEntries <= 0) return 0;
    const result = this.stmtCap.run(maxEntries);
    if (result.changes > 0) {
      console.log(`[SessionStore] Capped entries, removed ${result.changes}`);
    }
    return result.changes;
  }

  // -- Migration from legacy JSON -------------------------------------------

  private async migrateFromJson(): Promise<void> {
    if (!existsSync(this.jsonPath)) return;

    try {
      const raw = await readFile(this.jsonPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);

      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as Record<string, unknown>).version === 1 &&
        (parsed as Record<string, unknown>).sessions &&
        typeof (parsed as Record<string, unknown>).sessions === "object"
      ) {
        const sessions = (
          parsed as { sessions: Record<string, PersistedSession> }
        ).sessions;
        const entries = Object.values(sessions).filter(
          (e): e is PersistedSession =>
            !!e &&
            typeof e.sessionKey === "string" &&
            typeof e.sessionId === "string" &&
            typeof e.createdAt === "number" &&
            typeof e.updatedAt === "number",
        );

        if (entries.length > 0) {
          const insertMany = this.db.transaction(
            (items: PersistedSession[]) => {
              for (const entry of items) {
                this.stmtSet.run({
                  sessionKey: entry.sessionKey,
                  sessionId: entry.sessionId,
                  createdAt: entry.createdAt,
                  updatedAt: entry.updatedAt,
                  model: entry.model ?? null,
                });
              }
            },
          );
          insertMany(entries);
          console.log(
            `[SessionStore] Migrated ${entries.length} session(s) from JSON to SQLite`,
          );
        }
      }

      await rm(this.jsonPath, { force: true });
      console.log("[SessionStore] Removed legacy sessions.json");
    } catch (err) {
      console.error("[SessionStore] JSON migration failed (non-fatal):", err);
    }
  }
}
