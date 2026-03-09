/**
 * Daemon management — PID file, log rotation, process lifecycle.
 *
 * `klaus start`       → fork child in background, parent exits immediately
 * `klaus start -f`    → run in foreground (current behavior)
 * `klaus stop`        → send SIGTERM to daemon
 * `klaus status`      → check if daemon is running
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  openSync,
} from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";

const PID_FILE = join(CONFIG_DIR, "klaus.pid");
const LOG_DIR = join(CONFIG_DIR, "logs");
const LOG_FILE = join(LOG_DIR, "klaus.log");

// ---------------------------------------------------------------------------
// PID helpers
// ---------------------------------------------------------------------------

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  const raw = readFileSync(PID_FILE, "utf-8").trim();
  const pid = parseInt(raw, 10);
  return Number.isFinite(pid) ? pid : null;
}

/** Atomic PID write using exclusive create ('wx') to prevent races. */
function writePidExclusive(pid: number): boolean {
  mkdirSync(CONFIG_DIR, { recursive: true });
  try {
    writeFileSync(PID_FILE, String(pid), { mode: 0o644, flag: "wx" });
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

/** Overwrite PID file (used after stale PID cleanup). */
function writePid(pid: number): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid), { mode: 0o644 });
}

function removePid(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore if already gone
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fork `klaus start --foreground` as a detached background process.
 * Redirects stdout/stderr to the log file.
 * The parent process exits after the child is spawned.
 */
export function daemonize(): void {
  mkdirSync(LOG_DIR, { recursive: true });

  // Try atomic PID file creation first (prevents race between concurrent starts)
  const existingPid = readPid();
  if (existingPid !== null) {
    if (isProcessRunning(existingPid)) {
      console.log(`Klaus is already running (PID ${existingPid}).`);
      console.log(`Log: ${LOG_FILE}`);
      process.exit(0);
    }
    // Stale PID file — remove and retry
    removePid();
  }

  // Reserve PID file atomically BEFORE spawning to prevent race conditions.
  // Write a placeholder (parent PID) — will be overwritten with child PID.
  if (!writePidExclusive(process.pid)) {
    // Another daemonize() call won the race
    console.log("Klaus is already starting from another process.");
    process.exit(0);
  }

  // Open log file for append
  const logFd = openSync(LOG_FILE, "a");

  // Re-spawn ourselves with --foreground
  const scriptArgs = getScriptArgs();
  const child = spawn(process.execPath, [...scriptArgs, "--foreground"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env },
  });

  child.unref();

  const childPid = child.pid;
  if (childPid == null) {
    removePid();
    console.error("Failed to start daemon.");
    process.exit(1);
  }

  // Overwrite placeholder with actual child PID
  writePid(childPid);

  console.log(`Klaus started in background (PID ${childPid}).`);
  console.log(`Log: ${LOG_FILE}`);
  process.exit(0);
}

/**
 * Write PID file for foreground mode (so `klaus stop` still works).
 * Registers cleanup on exit.
 */
export function registerForegroundPid(): void {
  // Prevent overwriting an active daemon's PID
  const existing = readPid();
  if (
    existing !== null &&
    isProcessRunning(existing) &&
    existing !== process.pid
  ) {
    console.error(
      `Klaus is already running as daemon (PID ${existing}). Stop it first with: klaus stop`,
    );
    process.exit(1);
  }
  writePid(process.pid);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removePid();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

/**
 * Stop a running daemon by sending SIGTERM.
 * Waits up to 5 seconds for the process to exit before giving up.
 */
export async function stopDaemon(): Promise<void> {
  const pid = readPid();
  if (pid === null) {
    console.log("Klaus is not running (no PID file found).");
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log(`Klaus is not running (stale PID ${pid}). Cleaning up.`);
    removePid();
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to Klaus (PID ${pid}). Waiting for exit...`);
  } catch (err) {
    console.error(`Failed to stop Klaus (PID ${pid}):`, err);
    process.exit(1);
  }

  // Poll until process exits (up to 5s)
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      removePid();
      console.log("Klaus stopped.");
      return;
    }
    await sleep(200);
  }

  console.log(`Klaus (PID ${pid}) did not exit within 5s. PID file kept.`);
}

/**
 * Print daemon status.
 */
export function showStatus(): void {
  const pid = readPid();
  if (pid === null) {
    console.log("Klaus is not running.");
    return;
  }

  if (isProcessRunning(pid)) {
    console.log(`Klaus is running (PID ${pid}).`);
    console.log(`Log: ${LOG_FILE}`);
  } else {
    console.log(`Klaus is not running (stale PID ${pid}). Cleaning up.`);
    removePid();
  }
}

/**
 * Tail the daemon log file (like `tail -f`).
 */
export function tailLogs(): void {
  if (!existsSync(LOG_FILE)) {
    console.log("No log file found. Is Klaus running?");
    process.exit(1);
  }

  const tail = spawn("tail", ["-f", LOG_FILE], {
    stdio: ["ignore", "inherit", "inherit"],
  });

  tail.on("error", (err) => {
    console.error("Failed to tail logs:", err.message);
    process.exit(1);
  });

  process.once("SIGINT", () => {
    tail.kill("SIGINT");
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    tail.kill("SIGTERM");
    process.exit(0);
  });

  tail.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Reconstruct script args for re-spawn: [scriptPath, "start"] */
function getScriptArgs(): string[] {
  const scriptPath = process.argv[1];
  if (scriptPath.endsWith(".ts")) {
    console.error(
      "Daemon mode is not supported in dev (tsx). Use --foreground (-f) instead.",
    );
    process.exit(1);
  }
  return [scriptPath, "start"];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
