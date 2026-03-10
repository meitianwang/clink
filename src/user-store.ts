/**
 * User persistence: stores users and auth sessions in SQLite (~/.klaus/users.db).
 *
 * - Email + scrypt password authentication
 * - Google OAuth support (googleId field)
 * - Session token based auth (HttpOnly cookie)
 * - First registered user automatically becomes admin
 * - Invite code required for registration
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType, Statement } from "better-sqlite3";
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR } from "./config.js";

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options?: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, derivedKey: Buffer) => {
      if (err) reject(err);
      else resolve(derivedKey);
    };
    if (options) {
      scrypt(password, salt, keylen, options, cb);
    } else {
      scrypt(password, salt, keylen, cb);
    }
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: "admin" | "user";
  readonly googleId: string | null;
  readonly inviteCode: string;
  readonly createdAt: number;
  readonly lastLoginAt: number;
  readonly isActive: boolean;
}

export interface AuthSession {
  readonly token: string;
  readonly userId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly ip: string;
  readonly userAgent: string;
}

// ---------------------------------------------------------------------------
// Password hashing (Node.js built-in scrypt, no external deps)
// ---------------------------------------------------------------------------

// OWASP-recommended scrypt parameters
const SCRYPT_OPTS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(
    password,
    salt,
    64,
    SCRYPT_OPTS,
  )) as Buffer;
  return salt + ":" + derived.toString("hex");
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const derived = (await scryptAsync(
    password,
    salt,
    64,
    SCRYPT_OPTS,
  )) as Buffer;
  return timingSafeEqual(Buffer.from(key, "hex"), derived);
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL DEFAULT '',
    display_name    TEXT NOT NULL DEFAULT '',
    role            TEXT NOT NULL DEFAULT 'user',
    google_id       TEXT UNIQUE,
    invite_code     TEXT NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL,
    last_login_at   INTEGER NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    ip          TEXT NOT NULL DEFAULT '',
    user_agent  TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
`;

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  google_id: string | null;
  invite_code: string;
  created_at: number;
  last_login_at: number;
  is_active: number;
}

interface SessionRow {
  token: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  ip: string;
  user_agent: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as "admin" | "user",
    googleId: row.google_id,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    isActive: row.is_active === 1,
  };
}

function rowToSession(row: SessionRow): AuthSession {
  return {
    token: row.token,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ip: row.ip,
    userAgent: row.user_agent,
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// UserStore
// ---------------------------------------------------------------------------

export class UserStore {
  private readonly db: DatabaseType;

  // Pre-compiled statements
  private readonly stmtGetUserById: Statement;
  private readonly stmtGetUserByEmail: Statement;
  private readonly stmtGetUserByGoogleId: Statement;
  private readonly stmtInsertUser: Statement;
  private readonly stmtUpdateLastLogin: Statement;
  private readonly stmtSetActive: Statement;
  private readonly stmtSetRole: Statement;
  private readonly stmtSetDisplayName: Statement;
  private readonly stmtLinkGoogle: Statement;
  private readonly stmtListUsers: Statement;
  private readonly stmtCountUsers: Statement;

  private readonly stmtInsertSession: Statement;
  private readonly stmtGetSession: Statement;
  private readonly stmtDeleteSession: Statement;
  private readonly stmtDeleteUserSessions: Statement;
  private readonly stmtPruneSessions: Statement;
  private readonly stmtIncrFailedAttempts: Statement;
  private readonly stmtLockUser: Statement;
  private readonly stmtResetFailedAttempts: Statement;

  private readonly sessionMaxAgeMs: number;

  constructor(dbPath?: string, sessionMaxAgeMs?: number) {
    const resolvedPath = dbPath ?? join(CONFIG_DIR, "users.db");
    mkdirSync(dirname(resolvedPath), { recursive: true });

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(INIT_SQL);

    this.sessionMaxAgeMs = sessionMaxAgeMs ?? DEFAULT_SESSION_MAX_AGE_MS;

    // User statements
    this.stmtGetUserById = this.db.prepare("SELECT * FROM users WHERE id = ?");
    this.stmtGetUserByEmail = this.db.prepare(
      "SELECT * FROM users WHERE email = ?",
    );
    this.stmtGetUserByGoogleId = this.db.prepare(
      "SELECT * FROM users WHERE google_id = ?",
    );
    this.stmtInsertUser = this.db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, role, google_id, invite_code, created_at, last_login_at, is_active)
      VALUES (@id, @email, @passwordHash, @displayName, @role, @googleId, @inviteCode, @createdAt, @lastLoginAt, @isActive)
    `);
    this.stmtUpdateLastLogin = this.db.prepare(
      "UPDATE users SET last_login_at = ? WHERE id = ?",
    );
    this.stmtSetActive = this.db.prepare(
      "UPDATE users SET is_active = ? WHERE id = ?",
    );
    this.stmtSetRole = this.db.prepare(
      "UPDATE users SET role = ? WHERE id = ?",
    );
    this.stmtSetDisplayName = this.db.prepare(
      "UPDATE users SET display_name = ? WHERE id = ?",
    );
    this.stmtLinkGoogle = this.db.prepare(
      "UPDATE users SET google_id = ? WHERE id = ?",
    );
    this.stmtListUsers = this.db.prepare(
      "SELECT * FROM users ORDER BY created_at DESC",
    );
    this.stmtCountUsers = this.db.prepare(
      "SELECT COUNT(*) as count FROM users",
    );

    // Session statements
    this.stmtInsertSession = this.db.prepare(`
      INSERT INTO auth_sessions (token, user_id, created_at, expires_at, ip, user_agent)
      VALUES (@token, @userId, @createdAt, @expiresAt, @ip, @userAgent)
    `);
    this.stmtGetSession = this.db.prepare(
      "SELECT * FROM auth_sessions WHERE token = ?",
    );
    this.stmtDeleteSession = this.db.prepare(
      "DELETE FROM auth_sessions WHERE token = ?",
    );
    this.stmtDeleteUserSessions = this.db.prepare(
      "DELETE FROM auth_sessions WHERE user_id = ?",
    );
    this.stmtPruneSessions = this.db.prepare(
      "DELETE FROM auth_sessions WHERE expires_at < ?",
    );

    // Brute-force protection statements
    this.stmtIncrFailedAttempts = this.db.prepare(
      "UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?",
    );
    this.stmtLockUser = this.db.prepare(
      "UPDATE users SET locked_until = ? WHERE id = ?",
    );
    this.stmtResetFailedAttempts = this.db.prepare(
      "UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = ?",
    );

    // Ensure columns exist for upgraded databases
    try {
      this.db.exec(
        "ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0",
      );
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec(
        "ALTER TABLE users ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0",
      );
    } catch {
      /* column already exists */
    }

    // Best-effort file permissions
    try {
      chmodSync(resolvedPath, 0o600);
    } catch {
      /* ignore */
    }
  }

  // -- User registration ----------------------------------------------------

  /** Returns true if no users exist yet (first user becomes admin). */
  isFirstUser(): boolean {
    const row = this.stmtCountUsers.get() as { count: number };
    return row.count === 0;
  }

  /** Register a new user. Returns the created user. */
  async register(
    email: string,
    password: string,
    displayName: string,
    inviteCode: string,
  ): Promise<User> {
    const passwordHash = await hashPassword(password);
    const now = Date.now();
    const id = randomBytes(16).toString("hex");

    // Transaction to prevent TOCTOU race on isFirstUser check
    const insertUser = this.db.transaction(() => {
      const isFirst = this.isFirstUser();
      // Re-check invite code inside transaction to prevent race condition
      if (!isFirst && !inviteCode) {
        throw new Error("invite_code_required");
      }
      this.stmtInsertUser.run({
        id,
        email: email.toLowerCase().trim(),
        passwordHash,
        displayName: displayName.trim(),
        role: isFirst ? "admin" : "user",
        googleId: null,
        inviteCode,
        createdAt: now,
        lastLoginAt: now,
        isActive: 1,
      });
    });
    insertUser();

    return this.getUserById(id)!;
  }

  /** Register or login via Google OAuth. */
  async findOrCreateByGoogle(
    googleId: string,
    email: string,
    displayName: string,
    inviteCode?: string,
  ): Promise<{ user: User; isNew: boolean }> {
    // Check if user exists by googleId
    const byGoogle = this.stmtGetUserByGoogleId.get(googleId) as
      | UserRow
      | undefined;
    if (byGoogle) {
      this.stmtUpdateLastLogin.run(Date.now(), byGoogle.id);
      return {
        user: rowToUser({ ...byGoogle, last_login_at: Date.now() }),
        isNew: false,
      };
    }

    // Check if user exists by email (link Google account)
    const byEmail = this.stmtGetUserByEmail.get(email.toLowerCase().trim()) as
      | UserRow
      | undefined;
    if (byEmail) {
      this.stmtLinkGoogle.run(googleId, byEmail.id);
      this.stmtUpdateLastLogin.run(Date.now(), byEmail.id);
      return {
        user: rowToUser({
          ...byEmail,
          google_id: googleId,
          last_login_at: Date.now(),
        }),
        isNew: false,
      };
    }

    // New user — requires invite code (unless first user)
    const isFirst = this.isFirstUser();
    if (!isFirst && !inviteCode) {
      throw new Error("invite_code_required");
    }

    const now = Date.now();
    const id = randomBytes(16).toString("hex");

    // Transaction to prevent TOCTOU race on isFirstUser check
    const insertUser = this.db.transaction(() => {
      const isFirst = this.isFirstUser();
      // Re-check invite code inside transaction to prevent race condition
      if (!isFirst && !inviteCode) {
        throw new Error("invite_code_required");
      }
      this.stmtInsertUser.run({
        id,
        email: email.toLowerCase().trim(),
        passwordHash: "", // No password for Google-only users
        displayName: displayName.trim(),
        role: isFirst ? "admin" : "user",
        googleId,
        inviteCode: inviteCode ?? "",
        createdAt: now,
        lastLoginAt: now,
        isActive: 1,
      });
    });
    insertUser();

    return { user: this.getUserById(id)!, isNew: true };
  }

  // -- User login -----------------------------------------------------------

  /** Verify email + password. Returns user if valid, null otherwise. */
  async verifyLogin(email: string, password: string): Promise<User | null> {
    const row = this.stmtGetUserByEmail.get(email.toLowerCase().trim()) as
      | (UserRow & { failed_attempts: number; locked_until: number })
      | undefined;
    if (!row) return null;
    if (!row.is_active) return null;
    if (!row.password_hash) return null; // Google-only user

    // Check account lockout
    const now = Date.now();
    if (row.locked_until > now) return null;

    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) {
      this.stmtIncrFailedAttempts.run(row.id);
      if ((row.failed_attempts ?? 0) + 1 >= MAX_FAILED_ATTEMPTS) {
        this.stmtLockUser.run(now + LOCKOUT_DURATION_MS, row.id);
      }
      return null;
    }

    // Successful login — reset counters
    this.stmtResetFailedAttempts.run(row.id);
    this.stmtUpdateLastLogin.run(now, row.id);
    return rowToUser({ ...row, last_login_at: now });
  }

  // -- User queries ---------------------------------------------------------

  getUserById(id: string): User | undefined {
    const row = this.stmtGetUserById.get(id) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  }

  getUserByEmail(email: string): User | undefined {
    const row = this.stmtGetUserByEmail.get(email.toLowerCase().trim()) as
      | UserRow
      | undefined;
    return row ? rowToUser(row) : undefined;
  }

  listUsers(): readonly User[] {
    return (this.stmtListUsers.all() as UserRow[]).map(rowToUser);
  }

  // -- User management (admin) ----------------------------------------------

  setActive(userId: string, active: boolean): boolean {
    const result = this.stmtSetActive.run(active ? 1 : 0, userId);
    return result.changes > 0;
  }

  setRole(userId: string, role: "admin" | "user"): boolean {
    const result = this.stmtSetRole.run(role, userId);
    return result.changes > 0;
  }

  setDisplayName(userId: string, displayName: string): boolean {
    const result = this.stmtSetDisplayName.run(displayName, userId);
    return result.changes > 0;
  }

  // -- Auth sessions --------------------------------------------------------

  /** Create a new auth session. Returns the session. */
  createSession(userId: string, ip: string, userAgent: string): AuthSession {
    const token = randomBytes(32).toString("hex"); // 64 hex chars
    const now = Date.now();
    const expiresAt = now + this.sessionMaxAgeMs;

    this.stmtInsertSession.run({
      token,
      userId,
      createdAt: now,
      expiresAt,
      ip,
      userAgent: userAgent.slice(0, 500),
    });

    return { token, userId, createdAt: now, expiresAt, ip, userAgent };
  }

  /** Validate a session token. Returns user + session if valid. */
  validateSession(token: string): { user: User; session: AuthSession } | null {
    if (!token) return null;

    const row = this.stmtGetSession.get(token) as SessionRow | undefined;
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.stmtDeleteSession.run(token);
      return null;
    }

    const session = rowToSession(row);
    const user = this.getUserById(session.userId);
    if (!user || !user.isActive) {
      this.stmtDeleteSession.run(token);
      return null;
    }

    return { user, session };
  }

  /** Revoke a single session. */
  revokeSession(token: string): boolean {
    const result = this.stmtDeleteSession.run(token);
    return result.changes > 0;
  }

  /** Revoke all sessions for a user. */
  revokeAllSessions(userId: string): number {
    const result = this.stmtDeleteUserSessions.run(userId);
    return result.changes;
  }

  /** Remove expired sessions. */
  pruneExpiredSessions(): number {
    const result = this.stmtPruneSessions.run(Date.now());
    return result.changes;
  }

  // -- Lifecycle ------------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
