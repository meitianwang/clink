/**
 * Claude Code SDK wrapper for multi-turn conversations.
 *
 * ClaudeChat: single session with collect mode (message queuing when busy).
 * ChatSessionManager: per-session instances with LRU eviction.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadConfig } from "./config.js";
import type { SessionStore, PersistedSession } from "./session-store.js";
import type { ToolEventCallback } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSessionExpiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
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
// ClaudeChat: wraps Claude Agent SDK for multi-turn chat with collect mode
// ---------------------------------------------------------------------------

interface ChatOptions {
  systemPrompt: string;
  model?: string;
}

interface PendingMessage {
  prompt: string;
  deferred: Deferred<string | null>;
}

export class ClaudeChat {
  private sessionId: string | undefined;
  private busy = false;
  private pending: PendingMessage[] = [];
  private options: ChatOptions;
  private model: string | undefined;

  constructor(options: ChatOptions) {
    this.options = options;
    this.model = options.model;
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
  ): Promise<string> {
    try {
      return await this.doChatInner(prompt, onToolEvent);
    } catch (err) {
      if (this.sessionId && isSessionExpiredError(err)) {
        console.log("[Chat] Session expired, starting fresh session");
        this.sessionId = undefined;
        return await this.doChatInner(prompt, onToolEvent);
      }
      throw err;
    }
  }

  private async doChatInner(
    prompt: string,
    onToolEvent?: ToolEventCallback,
  ): Promise<string> {
    let resultText: string | undefined;
    let lastSessionId: string | undefined;

    const conversation = query({
      prompt,
      options: {
        systemPrompt: this.options.systemPrompt || undefined,
        permissionMode: "bypassPermissions",
        ...(this.model ? { model: this.model } : {}),
        ...(this.sessionId ? { resume: this.sessionId } : {}),
      },
    });

    for await (const msg of conversation) {
      if (msg.type === "result" && msg.subtype === "success") {
        resultText = msg.result;
      }
      if ("session_id" in msg && typeof msg.session_id === "string") {
        lastSessionId = msg.session_id;
      }

      // Extract tool use events for Web channel visualization
      if (onToolEvent) {
        this.emitToolEvents(msg, onToolEvent);
      }
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
            });
          }
        }
      }
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
      let reply = await this.doChat(prompt, onToolEvent);

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
          reply = await this.doChat(merged, onToolEvent);
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

  getModel(): string | undefined {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  async reset(): Promise<void> {
    this.sessionId = undefined;
  }

  async close(): Promise<void> {
    await this.reset();
  }
}

// ---------------------------------------------------------------------------
// ChatSessionManager: per-session ClaudeChat instances with LRU eviction
// ---------------------------------------------------------------------------

export class ChatSessionManager {
  static readonly MAX_SESSIONS = 20;
  private sessions = new Map<string, ClaudeChat>();
  private options: ChatOptions;
  private store: SessionStore | undefined;
  private idleMs: number;

  constructor(store?: SessionStore, idleMs?: number) {
    const cfg = loadConfig();
    const persona = (cfg.persona as string) ?? "";
    this.options = { systemPrompt: persona };
    this.store = store;
    this.idleMs = idleMs ?? 4 * 60 * 60 * 1000; // 4 hours default
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
      model: session.getModel(),
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

    const chat = new ClaudeChat(this.options);

    // Restore sessionId from persistent store if fresh
    if (this.store) {
      const persisted = this.store.get(sessionKey);
      if (persisted && this.store.isFresh(sessionKey, this.idleMs)) {
        chat.restoreSessionId(persisted.sessionId);
        if (persisted.model) {
          chat.setModel(persisted.model);
        }
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
  ): Promise<string | null> {
    await this.evictIfNeeded();
    const session = this.getSession(sessionKey);
    const result = await session.chat(prompt, onToolEvent);

    // Persist after successful chat (fire-and-forget)
    if (result !== null) {
      this.persistSession(sessionKey, session);
      this.store?.save().catch((err) => {
        console.error("[SessionStore] Save failed:", err);
      });
    }

    return result;
  }

  setModel(sessionKey: string, model: string): void {
    const session = this.getSession(sessionKey);
    session.setModel(model);
  }

  getModel(sessionKey: string): string | undefined {
    return this.sessions.get(sessionKey)?.getModel();
  }

  getSessionInfo(sessionKey: string): {
    active: boolean;
    busy: boolean;
    model: string | undefined;
  } {
    const session = this.sessions.get(sessionKey);
    return {
      active: !!session,
      busy: session?.isBusy ?? false,
      model: session?.getModel(),
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
