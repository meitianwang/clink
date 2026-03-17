/**
 * Claude Code CLI subprocess wrapper for multi-turn conversations.
 *
 * Spawns `claude -p --output-format stream-json` for each chat turn,
 * using `--resume` to maintain multi-turn context.
 *
 * ClaudeChat: single session with collect mode (message queuing when busy).
 * ChatSessionManager: per-session instances with LRU eviction.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { loadConfig } from "./config.js";
import { DEFAULT_PERSONA } from "./persona.js";
import { ensureWorkspace, extractUserId } from "./workspace.js";
import { writeWorkspacePersona, getClaudeBin } from "./claude-setup.js";
import type { SessionStore } from "./session-store.js";
import type { MessageStore } from "./message-store.js";
import type {
  ToolEventCallback,
  StreamChunkCallback,
  PermissionRequestCallback,
} from "./types.js";

// Max stderr buffer size to prevent unbounded memory growth
const MAX_STDERR_BUF = 8192;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSessionExpiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // CLI error: "No conversation found with session ID: ..."
  if (msg.includes("no conversation found")) return true;
  // SDK-style errors
  return (
    msg.includes("session") &&
    (msg.includes("not found") ||
      msg.includes("expired") ||
      msg.includes("invalid"))
  );
}

// ---------------------------------------------------------------------------
// Deferred: equivalent of Python asyncio.Future
// ---------------------------------------------------------------------------

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// ClaudeChat: wraps Claude CLI subprocess for multi-turn chat with collect mode
// ---------------------------------------------------------------------------

interface ChatOptions {
  /** Workspace directory — Claude reads CLAUDE.md, .mcp.json, etc. from here. */
  cwd?: string;
}

interface PendingMessage {
  prompt: string;
  deferred: Deferred<string | null>;
}

class ClaudeChat {
  private sessionId: string | undefined;
  private busy = false;
  private pending: PendingMessage[] = [];
  private options: ChatOptions;
  /** Currently running claude subprocess (for shutdown cleanup). */
  private activeChild: import("node:child_process").ChildProcess | null = null;
  /** Promise for the ongoing doChatInner call (so close() can await it). */
  private activeOp: Promise<string> | null = null;

  constructor(options: ChatOptions = {}) {
    this.options = options;
  }

  /** Get the current Claude SDK session ID (for persistence). */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /** Restore a session ID from persistent storage. */
  restoreSessionId(id: string): void {
    this.sessionId = id;
  }

  /**
   * Send a message to Claude. If the error indicates a stale/expired session,
   * clears sessionId and retries once without resume.
   */
  private async doChat(
    prompt: string,
    onToolEvent?: ToolEventCallback,
    onStreamChunk?: StreamChunkCallback,
    onPermissionRequest?: PermissionRequestCallback,
  ): Promise<string> {
    try {
      const p = this.doChatInner(
        prompt,
        onToolEvent,
        onStreamChunk,
        onPermissionRequest,
      );
      this.activeOp = p;
      return await p;
    } catch (err) {
      if (this.sessionId && isSessionExpiredError(err)) {
        console.log("[Chat] Session expired, starting fresh session");
        this.sessionId = undefined;
        const p = this.doChatInner(
          prompt,
          onToolEvent,
          onStreamChunk,
          onPermissionRequest,
        );
        this.activeOp = p;
        return await p;
      }
      throw err;
    } finally {
      this.activeOp = null;
    }
  }

  private async doChatInner(
    prompt: string,
    onToolEvent?: ToolEventCallback,
    onStreamChunk?: StreamChunkCallback,
    // Kept in signature for interface compatibility with ChannelPlugin handler.
    // Permissions are managed via ~/.claude/settings.json (admin-only).
    _onPermissionRequest?: PermissionRequestCallback,
  ): Promise<string> {
    // All config comes from native files:
    //   persona → <cwd>/CLAUDE.md
    //   rules   → ~/.claude/rules/*.md

    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "bypassPermissions",
    ];

    if (onStreamChunk) {
      args.push("--include-partial-messages");
    }

    // Resume previous session for multi-turn conversations
    if (this.sessionId) {
      args.push("--resume", this.sessionId);
    }

    // Pipe prompt via stdin to avoid ARG_MAX limit.

    let resultText: string | undefined;
    let lastSessionId: string | undefined;
    let stderrBuf = "";

    const child = spawn(getClaudeBin(), args, {
      cwd: this.options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.activeChild = child;

    // Register close handler BEFORE starting readline to avoid race condition
    const exitPromise = new Promise<number | null>((resolve) => {
      child.on("close", (code) => {
        this.activeChild = null;
        resolve(code);
      });
    });

    // Pipe prompt via stdin (avoids ARG_MAX limit)
    child.stdin.end(prompt);

    // Collect stderr for error reporting (capped to prevent unbounded growth)
    child.stderr.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      stderrBuf += str;
      if (stderrBuf.length > MAX_STDERR_BUF) {
        stderrBuf = stderrBuf.slice(-MAX_STDERR_BUF);
      }
    });

    // Parse NDJSON from stdout line-by-line
    const rl = createInterface({ input: child.stdout });

    for await (const line of rl) {
      if (!line.trim()) continue;
      let msg: { type: string; [key: string]: unknown };
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed?.type !== "string") continue;
        msg = parsed;
      } catch {
        continue;
      }

      // Extract session_id from any message that carries it
      if (typeof msg.session_id === "string") {
        lastSessionId = msg.session_id;
      }

      // Final result
      if (msg.type === "result") {
        if (msg.subtype === "success") {
          resultText = msg.result as string;
        } else if (msg.is_error && Array.isArray(msg.errors) && msg.errors.length > 0) {
          // CLI reports errors (e.g. invalid session) in the result JSON, not stderr
          throw new Error(String(msg.errors[0]));
        } else if (msg.is_error && typeof msg.result === "string" && msg.result) {
          // Some errors come as result text (e.g. "Not logged in")
          throw new Error(msg.result);
        }
      }

      // Tool use events for Web channel visualization
      if (onToolEvent) {
        this.emitToolEvents(msg, onToolEvent);
      }

      // Streaming text deltas
      if (msg.type === "stream_event" && onStreamChunk) {
        this.emitStreamChunk(msg, onStreamChunk);
      }
    }

    // Wait for process to exit (handler registered before readline loop)
    const exitCode = await exitPromise;

    if (exitCode !== 0 && !resultText) {
      const errMsg = stderrBuf.trim() || `claude process exited with code ${exitCode}`;
      throw new Error(errMsg);
    }

    if (lastSessionId) {
      this.sessionId = lastSessionId;
    }

    return resultText || "(no response)";
  }

  private emitToolEvents(
    msg: { type: string; [key: string]: unknown },
    onToolEvent: ToolEventCallback,
  ): void {
    // Sub-agent context: non-null when inside a sub-agent execution
    const parentToolUseId =
      typeof msg.parent_tool_use_id === "string"
        ? msg.parent_tool_use_id
        : undefined;

    // SDKAssistantMessage: content[] may contain tool_use blocks
    if (msg.type === "assistant") {
      const message = msg.message as
        | {
            content?: readonly {
              type: string;
              id?: string;
              name?: string;
              input?: unknown;
            }[];
          }
        | undefined;
      if (message?.content) {
        for (const block of message.content) {
          if (block.type === "tool_use" && block.id && block.name) {
            onToolEvent({
              type: "tool_start",
              toolUseId: block.id,
              toolName: block.name,
              input: (block.input ?? {}) as Record<string, unknown>,
              timestamp: Date.now(),
              ...(parentToolUseId ? { parentToolUseId } : {}),
            });
          }
        }
      }
    }

    // SDKUserMessage: content[] may contain tool_result blocks
    if (msg.type === "user") {
      const message = msg.message as
        | {
            content?:
              | readonly {
                  type: string;
                  tool_use_id?: string;
                  is_error?: boolean;
                }[]
              | string;
          }
        | undefined;
      if (message?.content && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (
            typeof block === "object" &&
            block !== null &&
            block.type === "tool_result" &&
            block.tool_use_id
          ) {
            onToolEvent({
              type: "tool_result",
              toolUseId: block.tool_use_id,
              toolName: "",
              isError: block.is_error ?? false,
              timestamp: Date.now(),
              ...(parentToolUseId ? { parentToolUseId } : {}),
            });
          }
        }
      }
    }
  }

  private emitStreamChunk(
    msg: { type: string; [key: string]: unknown },
    onStreamChunk: StreamChunkCallback,
  ): void {
    // SDKPartialAssistantMessage: stream_event with content_block_delta
    const event = msg.event as Record<string, unknown> | undefined;
    if (!event || event.type !== "content_block_delta") return;
    // Only emit top-level text (not sub-agent streams)
    if (typeof msg.parent_tool_use_id === "string") return;
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      onStreamChunk(delta.text);
    }
  }

  /**
   * Send a message, return the full text reply.
   *
   * If the agent is busy, the message is queued (collect mode).
   * Returns null for callers whose messages were merged into a batch.
   */
  async chat(
    prompt: string,
    onToolEvent?: ToolEventCallback,
    onStreamChunk?: StreamChunkCallback,
    onPermissionRequest?: PermissionRequestCallback,
  ): Promise<string | null> {
    if (this.busy) {
      const deferred = createDeferred<string | null>();
      this.pending.push({ prompt, deferred });
      console.log(
        `[Collect] Queued (pending: ${this.pending.length}): ${prompt.slice(0, 80)}`,
      );
      return deferred.promise;
    }

    this.busy = true;
    try {
      let reply = await this.doChat(
        prompt,
        onToolEvent,
        onStreamChunk,
        onPermissionRequest,
      );

      // Drain queued messages (collect mode)
      while (this.pending.length > 0) {
        const batch = [...this.pending];
        this.pending = [];

        const prompts = batch.map((b) => b.prompt);
        const merged =
          "[以下是你处理上一条消息期间用户追加发送的消息]\n" +
          prompts.join("\n");
        console.log(
          `[Collect] Merging ${batch.length} queued message(s): ${merged.slice(0, 120)}`,
        );

        // Earlier callers: their messages are merged, no separate reply
        for (const item of batch.slice(0, -1)) {
          item.deferred.resolve(null);
        }

        // Process the merged message; ensure last caller's deferred
        // is always resolved even if doChat throws.
        try {
          reply = await this.doChat(
            merged,
            onToolEvent,
            onStreamChunk,
            onPermissionRequest,
          );
          batch[batch.length - 1].deferred.resolve(reply);
        } catch (e) {
          batch[batch.length - 1].deferred.resolve(null);
          throw e;
        }
      }

      return reply;
    } catch (err) {
      // Resolve all pending deferreds so callers don't hang forever
      for (const item of this.pending) {
        item.deferred.resolve(null);
      }
      this.pending = [];
      await this.reset();
      throw err;
    } finally {
      this.busy = false;
    }
  }

  get isBusy(): boolean {
    return this.busy;
  }

  async reset(): Promise<void> {
    this.sessionId = undefined;
  }

  async close(): Promise<void> {
    // Kill any running claude subprocess
    if (this.activeChild) {
      this.activeChild.kill("SIGTERM");
      this.activeChild = null;
    }
    // Wait for ongoing chat to settle (it will throw due to killed child)
    if (this.activeOp) {
      try { await this.activeOp; } catch { /* expected during shutdown */ }
    }
    await this.reset();
  }
}

// ---------------------------------------------------------------------------
// ChatSessionManager: per-session ClaudeChat instances with LRU eviction
// ---------------------------------------------------------------------------

export class ChatSessionManager {
  static readonly MAX_SESSIONS = 20;
  private sessions = new Map<string, ClaudeChat>();
  private store: SessionStore | undefined;
  private messageStore: MessageStore | undefined;
  private idleMs: number;
  /** Persona text written to each workspace's CLAUDE.md. */
  private persona: string;

  constructor(
    store?: SessionStore,
    idleMs?: number,
    messageStore?: MessageStore,
  ) {
    const cfg = loadConfig();
    this.persona = (cfg.persona as string) || DEFAULT_PERSONA;
    this.store = store;
    this.messageStore = messageStore;
    this.idleMs = idleMs ?? 4 * 60 * 60 * 1000; // 4 hours default
  }

  /**
   * Update the persona text (admin operation).
   * Rewrites CLAUDE.md in all active user workspaces so running sessions
   * pick up the new persona on their next turn.
   */
  setPersona(persona: string): void {
    this.persona = persona;
    // Rewrite CLAUDE.md in every active workspace
    for (const sessionKey of this.sessions.keys()) {
      const userId = extractUserId(sessionKey);
      if (userId) {
        const cwd = ensureWorkspace(userId);
        writeWorkspacePersona(cwd, persona);
      }
    }
  }

  private persistSession(key: string, session: ClaudeChat): void {
    if (!this.store) return;
    const sessionId = session.getSessionId();
    if (!sessionId) return;
    const existing = this.store.get(key);
    this.store.set(key, {
      sessionId,
      sessionKey: key,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  }

  private async evictIfNeeded(): Promise<void> {
    if (this.sessions.size < ChatSessionManager.MAX_SESSIONS) return;
    for (const [key, session] of this.sessions) {
      if (!session.isBusy) {
        // Save sessionId before eviction so it can be restored later
        this.persistSession(key, session);
        await session.close();
        this.sessions.delete(key);
        console.log(`[Session] Evicted (LRU): ${key}`);
        this.store?.save().catch((err) => {
          console.error("[SessionStore] Save after eviction failed:", err);
        });
        return;
      }
    }
  }

  private getSession(sessionKey: string): ClaudeChat {
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      // Move to end (most recently used)
      this.sessions.delete(sessionKey);
      this.sessions.set(sessionKey, existing);
      return existing;
    }

    // Resolve per-user workspace directory (isolates file access).
    // Write CLAUDE.md with persona so Claude reads it as project instructions.
    const userId = extractUserId(sessionKey);
    let cwd: string | undefined;
    if (userId) {
      cwd = ensureWorkspace(userId);
      writeWorkspacePersona(cwd, this.persona);
    }

    const chat = new ClaudeChat(cwd ? { cwd } : {});

    // Restore sessionId from persistent store if fresh
    if (this.store) {
      const persisted = this.store.get(sessionKey);
      if (persisted && this.store.isFresh(sessionKey, this.idleMs)) {
        chat.restoreSessionId(persisted.sessionId);
        console.log(`[Session] Restored from store: ${sessionKey}`);
      }
    }

    this.sessions.set(sessionKey, chat);
    console.log(
      `[Session] New session: ${sessionKey} (total: ${this.sessions.size})`,
    );
    return chat;
  }

  async chat(
    sessionKey: string,
    prompt: string,
    onToolEvent?: ToolEventCallback,
    onStreamChunk?: StreamChunkCallback,
    onPermissionRequest?: PermissionRequestCallback,
    /** User-facing display text for history (defaults to prompt if omitted). */
    displayText?: string,
  ): Promise<string | null> {
    await this.evictIfNeeded();
    const session = this.getSession(sessionKey);

    const result = await session.chat(
      prompt,
      onToolEvent,
      onStreamChunk,
      onPermissionRequest,
    );

    // Persist after successful chat (fire-and-forget)
    if (result !== null) {
      this.persistSession(sessionKey, session);
      this.store?.save().catch((err) => {
        console.error("[SessionStore] Save failed:", err);
      });

      // Append messages to transcript (fire-and-forget async)
      if (this.messageStore) {
        this.messageStore
          .append(sessionKey, "user", displayText ?? prompt)
          .then(() =>
            this.messageStore!.append(sessionKey, "assistant", result),
          )
          .catch((err) => console.error("[MessageStore] Append failed:", err));
      }
    }

    return result;
  }

  /**
   * Lightweight chat: skips persona/skills/memory in system prompt.
   * Used by cron tasks with lightContext: true for faster execution.
   */
  async chatLight(sessionKey: string, prompt: string): Promise<string | null> {
    await this.evictIfNeeded();

    // Lightweight session: no per-user workspace (no persona CLAUDE.md).
    // Global settings.json and rules still apply.
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      // LRU update: move to end
      this.sessions.delete(sessionKey);
      this.sessions.set(sessionKey, existing);
    } else {
      const chat = new ClaudeChat();

      // Restore from store if available
      if (this.store) {
        const persisted = this.store.get(sessionKey);
        if (persisted && this.store.isFresh(sessionKey, this.idleMs)) {
          chat.restoreSessionId(persisted.sessionId);
        }
      }

      this.sessions.set(sessionKey, chat);
    }

    const session = this.sessions.get(sessionKey)!;
    const result = await session.chat(prompt);

    if (result !== null) {
      this.persistSession(sessionKey, session);
      this.store?.save().catch((err) => {
        console.error("[SessionStore] Save failed:", err);
      });
    }

    return result;
  }

  getSessionInfo(sessionKey: string): {
    active: boolean;
    busy: boolean;
  } {
    const session = this.sessions.get(sessionKey);
    return {
      active: !!session,
      busy: session?.isBusy ?? false,
    };
  }

  async reset(sessionKey: string): Promise<void> {
    const session = this.sessions.get(sessionKey);
    if (session) {
      await session.reset();
      this.sessions.delete(sessionKey);

      // Remove from persistent store
      if (this.store) {
        this.store.delete(sessionKey);
        this.store.save().catch((err) => {
          console.error("[SessionStore] Save failed:", err);
        });
      }

      console.log(`[Session] Reset: ${sessionKey}`);
    }
  }

  async close(): Promise<void> {
    // Persist all active sessions before closing
    if (this.store) {
      for (const [key, session] of this.sessions) {
        this.persistSession(key, session);
      }
      await this.store.close().catch((err) => {
        console.error("[SessionStore] Failed to save on close:", err);
      });
    }

    for (const session of this.sessions.values()) {
      await session.close();
    }
    this.sessions.clear();
  }
}
