/**
 * Invite code persistence: stores invite codes in SQLite (~/.klaus/invites.db)
 * for multi-user access control on the Web channel.
 *
 * Admin creates invite codes via the admin panel; each invite code acts as
 * a scoped token — users with an invite code can only see their own sessions.
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType, Statement } from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InviteCode {
  readonly code: string;
  readonly label: string;
  readonly createdAt: number;
  readonly isActive: boolean;
  readonly usedBy: string | null;
  readonly usedAt: number | null;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS invite_codes (
    code        TEXT PRIMARY KEY,
    label       TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    used_by     TEXT,
    used_at     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_invite_codes_active
    ON invite_codes(is_active);
`;

const MIGRATE_SQL = `
  ALTER TABLE invite_codes ADD COLUMN used_by TEXT;
  ALTER TABLE invite_codes ADD COLUMN used_at INTEGER;
`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface DbRow {
  code: string;
  label: string;
  created_at: number;
  is_active: number;
  used_by: string | null;
  used_at: number | null;
}

function rowToInviteCode(row: DbRow): InviteCode {
  return {
    code: row.code,
    label: row.label,
    createdAt: row.created_at,
    isActive: row.is_active === 1,
    usedBy: row.used_by,
    usedAt: row.used_at,
  };
}

// ---------------------------------------------------------------------------
// InviteStore
// ---------------------------------------------------------------------------

export class InviteStore {
  private readonly db: DatabaseType;

  // Pre-compiled statements
  private readonly stmtList: Statement;
  private readonly stmtGet: Statement;
  private readonly stmtInsert: Statement;
  private readonly stmtDelete: Statement;
  private readonly stmtConsume: Statement;
  private readonly stmtIsValid: Statement;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? join(CONFIG_DIR, "invites.db");
    mkdirSync(dirname(resolvedPath), { recursive: true });

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(INIT_SQL);

    // Migrate: add used_by/used_at columns if missing
    const cols = this.db.prepare("PRAGMA table_info(invite_codes)").all() as {
      name: string;
    }[];
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("used_by")) {
      try {
        this.db.exec(MIGRATE_SQL);
      } catch {
        // columns may already exist from partial migration
      }
    }

    const SELECT_COLS = "code, label, created_at, is_active, used_by, used_at";

    // Pre-compile statements
    this.stmtList = this.db.prepare(
      `SELECT ${SELECT_COLS} FROM invite_codes ORDER BY created_at DESC`,
    );
    this.stmtGet = this.db.prepare(
      `SELECT ${SELECT_COLS} FROM invite_codes WHERE code = ?`,
    );
    this.stmtInsert = this.db.prepare(
      "INSERT INTO invite_codes (code, label, created_at, is_active) VALUES (@code, @label, @createdAt, @isActive)",
    );
    this.stmtDelete = this.db.prepare(
      "DELETE FROM invite_codes WHERE code = ?",
    );
    this.stmtConsume = this.db.prepare(
      "UPDATE invite_codes SET is_active = 0, used_by = @usedBy, used_at = @usedAt WHERE code = @code AND is_active = 1",
    );
    this.stmtIsValid = this.db.prepare(
      "SELECT 1 FROM invite_codes WHERE code = ? AND is_active = 1",
    );
  }

  /** List all invite codes (newest first). */
  list(): readonly InviteCode[] {
    return (this.stmtList.all() as DbRow[]).map(rowToInviteCode);
  }

  /** Get a single invite code by code string. */
  get(code: string): InviteCode | undefined {
    const row = this.stmtGet.get(code) as DbRow | undefined;
    return row ? rowToInviteCode(row) : undefined;
  }

  /** Check if a code is a valid (existing + active) invite code. */
  isValid(code: string): boolean {
    return this.stmtIsValid.get(code) !== undefined;
  }

  /** Create a new invite code. Returns the created InviteCode. */
  create(label: string = ""): InviteCode {
    const code = randomBytes(16).toString("hex"); // 32 hex chars
    const createdAt = Date.now();
    this.stmtInsert.run({ code, label, createdAt, isActive: 1 });
    return {
      code,
      label,
      createdAt,
      isActive: true,
      usedBy: null,
      usedAt: null,
    };
  }

  /** Mark an invite code as consumed. Records who used it and when. */
  consume(code: string, usedBy: string): boolean {
    const result = this.stmtConsume.run({ code, usedBy, usedAt: Date.now() });
    return result.changes > 0;
  }

  /** Delete an invite code permanently. Returns true if deleted. */
  delete(code: string): boolean {
    const result = this.stmtDelete.run(code);
    return result.changes > 0;
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }
}
