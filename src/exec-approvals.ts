/**
 * Exec approval socket client — connects to the macOS app's Unix socket
 * to request command approval before executing shell commands.
 *
 * Protocol: JSON-newline over Unix domain socket with HMAC-SHA256 auth.
 */

import { createConnection } from "node:net";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";

const EXEC_SOCKET = join(CONFIG_DIR, "exec.sock");
const EXEC_TOKEN_FILE = join(CONFIG_DIR, "exec.token");
const REQUEST_TIMEOUT_MS = 120_000;
const EXEC_TIMEOUT_MS = 30_000;

export type ExecDecision = "allow-once" | "allow-always" | "deny";

interface ExecApprovalResult {
  decision: ExecDecision;
}

interface ExecRunResult {
  exitCode: number;
  timedOut: boolean;
  success: boolean;
  stdout: string;
  stderr: string;
  error: string | null;
}

function readExecToken(): string | null {
  if (!existsSync(EXEC_TOKEN_FILE)) return null;
  return readFileSync(EXEC_TOKEN_FILE, "utf-8").trim();
}

function hmacHex(token: string, nonce: string, ts: number, requestJson: string): string {
  const message = `${nonce}:${ts}:${requestJson}`;
  return createHmac("sha256", token).update(message).digest("hex");
}

/**
 * Check if the macOS app exec socket is available.
 */
export function isExecSocketAvailable(): boolean {
  return existsSync(EXEC_SOCKET) && readExecToken() !== null;
}

/**
 * Send a command approval request to the macOS app via Unix socket.
 * Returns the user's decision (allow-once, allow-always, deny).
 */
export function requestExecApproval(opts: {
  command: string;
  cwd?: string;
  agentId?: string;
  sessionKey?: string;
}): Promise<ExecApprovalResult> {
  const token = readExecToken();
  if (!token) return Promise.reject(new Error("No exec token"));

  const id = randomBytes(8).toString("hex");
  const payload = JSON.stringify({
    type: "request",
    token,
    id,
    request: {
      command: opts.command,
      cwd: opts.cwd ?? process.cwd(),
      agentId: opts.agentId ?? "main",
      sessionKey: opts.sessionKey ?? "default",
    },
  });

  return socketRequest<ExecApprovalResult>(payload, id, REQUEST_TIMEOUT_MS);
}

/**
 * Send a command for execution to the macOS app (after approval).
 * The macOS app runs the command with its TCC permissions and returns stdout/stderr.
 */
export function requestExecRun(opts: {
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  agentId?: string;
  sessionKey?: string;
  approvalDecision: ExecDecision;
}): Promise<ExecRunResult> {
  const token = readExecToken();
  if (!token) return Promise.reject(new Error("No exec token"));

  const id = randomBytes(8).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const ts = Date.now();

  const requestJson = JSON.stringify({
    command: opts.command,
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ?? {},
    timeoutMs: opts.timeoutMs ?? EXEC_TIMEOUT_MS,
    needsScreenRecording: false,
    agentId: opts.agentId ?? "main",
    sessionKey: opts.sessionKey ?? "default",
    approvalDecision: opts.approvalDecision,
  });

  const hmac = hmacHex(token, nonce, ts, requestJson);

  const payload = JSON.stringify({
    type: "exec",
    id,
    nonce,
    ts,
    hmac,
    requestJson,
  });

  return socketRequest<ExecRunResult>(payload, id, opts.timeoutMs ?? EXEC_TIMEOUT_MS);
}

function socketRequest<T>(payload: string, id: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(EXEC_SOCKET);
    let buffer = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error("Exec socket request timed out"));
      }
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(payload + "\n");
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx === -1) return;

      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();

      try {
        const response = JSON.parse(line);
        if (response.id !== id) {
          reject(new Error("Response ID mismatch"));
          return;
        }
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        // For approval: { type: "decision", id, decision }
        // For exec: { type: "exec-res", id, ok, payload, error }
        if (response.type === "decision") {
          resolve({ decision: response.decision } as T);
        } else if (response.type === "exec-res") {
          if (!response.ok) {
            reject(new Error(response.error ?? "exec failed"));
            return;
          }
          resolve(response.payload as T);
        } else {
          resolve(response as T);
        }
      } catch (err) {
        reject(new Error(`Invalid response: ${err}`));
      }
    });

    socket.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    socket.on("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("Socket closed before response"));
      }
    });
  });
}
