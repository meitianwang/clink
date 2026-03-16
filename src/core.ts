/**
 * Claude Code SDK wrapper for multi-turn conversations.
 *
 * ClaudeChat: single session with collect mode (message queuing when busy).
 * ChatSessionManager: per-session instances with LRU eviction.
 */

import { query, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { loadConfig } from "./config.js";
import { getToolConfig } from "./tool-config.js";
import { DEFAULT_PERSONA } from "./persona.js";
import { ensureWorkspace, extractUserId } from "./workspace.js";
import type { SessionStore, PersistedSession } from "./session-store.js";
import type { MessageStore } from "./message-store.js";
import { type MemoryStore, buildMemoryFlushPrompt } from "./memory-store.js";
import { buildSkillsPrompt } from "./skills/index.js";
import type {
  ToolEventCallback,
  StreamChunkCallback,
  PermissionRequestCallback,
  PermissionRequest,
} from "./types.js";

/**
 * Memory flush interval: trigger a silent memory-save turn every N chat rounds.
 * Aligned with OpenClaw's pre-compaction flush concept, but using message count
 * as proxy since we don't have access to SDK token counts.
 */
const MEMORY_FLUSH_INTERVAL = 20;

// Read-only tools — auto-allow without permission prompt
const READ_ONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "TodoWrite",
]);

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
  cwd?: string;
  mcpServers?: Record<string, McpServerConfig>;
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
  /** Number of completed chat rounds (for memory flush timing). */
  private chatRoundCount = 0;

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
    onStreamChunk?: StreamChunkCallback,
    onPermissionRequest?: PermissionRequestCallback,
  ): Promise<string> {
    try {
      return await this.doChatInner(
        prompt,
        onToolEvent,
        onStreamChunk,
        onPermissionRequest,
      );
    } catch (err) {
      if (this.sessionId && isSessionExpiredError(err)) {
        console.log("[Chat] Session expired, starting fresh session");
        this.sessionId = undefined;
        return await this.doChatInner(
          prompt,
          onToolEvent,
          onStreamChunk,
          onPermissionRequest,
        );
      }
      throw err;
    }
  }

  private async doChatInner(
    prompt: string,
    onToolEvent?: ToolEventCallback,
    onStreamChunk?: StreamChunkCallback,
    onPermissionRequest?: PermissionRequestCallback,
  ): Promise<string> {
    let resultText: string | undefined;
    let lastSessionId: string | undefined;

    const conversation = query({
      prompt,
      options: {
        systemPrompt: this.options.systemPrompt || undefined,
        permissionMode: onPermissionRequest ? "default" : "bypassPermissions",
        ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
        ...(onPermissionRequest
          ? {
              canUseTool: async (
                toolName: string,
                input: Record<string, unknown>,
                opts: { toolUseID: string; decisionReason?: string },
              ) => {
                if (READ_ONLY_TOOLS.has(toolName)) {
                  return { behavior: "allow" as const };
                }
                const config = getToolConfig(toolName);
                const request: PermissionRequest = {
                  requestId: opts.toolUseID,
                  toolName,
                  toolUseId: opts.toolUseID,
                  input,
                  description: opts.decisionReason,
                  display: {
                    icon: config.icon,
                    label: config.label,
                    style: config.style,
                    value: config.getValue(input),
                    ...(config.getSecondary
                      ? { secondary: config.getSecondary(input) }
                      : {}),
                  },
                };
                const response = await onPermissionRequest(request);
                return response.allow
                  ? { behavior: "allow" as const }
                  : {
                      behavior: "deny" as const,
                      message: "User denied the tool execution",
                    };
              },
            }
          : {}),
        ...(this.model ? { model: this.model } : {}),
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        ...(onStreamChunk ? { includePartialMessages: true } : {}),
        ...(this.options.mcpServers
          ? { mcpServers: this.options.mcpServers }
          : {}),
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

      // Extract streaming text deltas
      if (msg.type === "stream_event" && onStreamChunk) {
        this.emitStreamChunk(msg, onStreamChunk);
      }
    }

    if (lastSessionId) {
      this.sessionId = lastSessionId;
    }

    this.chatRoundCount++;
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

  getModel(): string | undefined {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  /** Update the system prompt (e.g. to refresh memory context). */
  setSystemPrompt(prompt: string): void {
    this.options = { ...this.options, systemPrompt: prompt };
  }

  /** Get the number of completed chat rounds. */
  getRoundCount(): number {
    return this.chatRoundCount;
  }

  async reset(): Promise<void> {
    this.sessionId = undefined;
    this.chatRoundCount = 0;
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
  private messageStore: MessageStore | undefined;
  private memoryStore: MemoryStore | undefined;
  private idleMs: number;

  constructor(
    store?: SessionStore,
    idleMs?: number,
    messageStore?: MessageStore,
    memoryStore?: MemoryStore,
  ) {
    const cfg = loadConfig();
    const persona = (cfg.persona as string) || DEFAULT_PERSONA;
    const model = (cfg.model as string) || undefined;
    this.options = { systemPrompt: persona, model };
    this.store = store;
    this.messageStore = messageStore;
    this.memoryStore = memoryStore;
    this.idleMs = idleMs ?? 4 * 60 * 60 * 1000; // 4 hours default
  }

  /** Update the default model for new and existing sessions. */
  setDefaultModel(model: string | undefined): void {
    this.options = { ...this.options, model };
    for (const session of this.sessions.values()) {
      if (model) {
        session.setModel(model);
      }
    }
  }

  /** Get the current default model. */
  getDefaultModel(): string | undefined {
    return this.options.model;
  }

  /** Update the system prompt for new sessions (existing sessions keep their prompt until reset). */
  setPersona(persona: string): void {
    this.options = { ...this.options, systemPrompt: persona };
  }

  /** Inject MCP servers into all future sessions (called after CronScheduler init). */
  setMcpServers(servers: Record<string, McpServerConfig>): void {
    this.options = { ...this.options, mcpServers: servers };
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

  private buildSystemPrompt(sessionKey: string): string {
    let prompt = this.options.systemPrompt;

    // Append skills section
    const skillsSection = buildSkillsPrompt();
    if (skillsSection) {
      prompt = `${prompt}\n\n${skillsSection}`;
    }

    // Append memory section
    if (this.memoryStore) {
      const memorySection = this.memoryStore.buildMemoryPrompt(sessionKey);
      if (memorySection) {
        prompt = `${prompt}\n\n${memorySection}`;
      }
    }

    return prompt;
  }

  private getSession(sessionKey: string): ClaudeChat {
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      // Move to end (most recently used)
      this.sessions.delete(sessionKey);
      this.sessions.set(sessionKey, existing);
      return existing;
    }

    // Resolve per-user workspace directory (isolates file access)
    const userId = extractUserId(sessionKey);
    const cwd = userId ? ensureWorkspace(userId) : undefined;

    const sessionOptions: ChatOptions = {
      ...this.options,
      systemPrompt: this.buildSystemPrompt(sessionKey),
      ...(cwd ? { cwd } : {}),
    };
    const chat = new ClaudeChat(sessionOptions);

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
    onStreamChunk?: StreamChunkCallback,
    onPermissionRequest?: PermissionRequestCallback,
    /** User-facing display text for history (defaults to prompt if omitted). */
    displayText?: string,
  ): Promise<string | null> {
    await this.evictIfNeeded();
    const session = this.getSession(sessionKey);

    // Refresh memory in system prompt before each chat
    if (this.memoryStore) {
      session.setSystemPrompt(this.buildSystemPrompt(sessionKey));
    }

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

      // Memory flush: schedule a silent turn AFTER returning, so the user
      // gets their reply immediately. The flush runs when the session is idle.
      if (this.shouldFlushMemory(session)) {
        const sk = sessionKey;
        setTimeout(() => {
          this.runMemoryFlush(sk, session).catch((err) => {
            console.error("[Memory] Flush failed:", err);
          });
        }, 500);
      }
    }

    return result;
  }

  /** Check if memory flush should trigger (without side effects). */
  private shouldFlushMemory(session: ClaudeChat): boolean {
    if (!this.memoryStore) return false;
    const rounds = session.getRoundCount();
    return rounds > 0 && rounds % MEMORY_FLUSH_INTERVAL === 0;
  }

  /**
   * Run a silent memory flush turn. Aligned with OpenClaw's pre-compaction
   * flush: a hidden agent turn that saves durable memories to disk.
   *
   * Skips if the session is busy (user sent a new message before flush ran).
   * The flush reply is discarded — the user never sees it.
   */
  private async runMemoryFlush(
    sessionKey: string,
    session: ClaudeChat,
  ): Promise<void> {
    // Skip if user already started a new conversation turn
    if (session.isBusy) {
      console.log(`[Memory] Flush skipped (session busy): ${sessionKey}`);
      return;
    }

    console.log(
      `[Memory] Triggering flush for ${sessionKey} (round ${session.getRoundCount()})`,
    );
    try {
      session.setSystemPrompt(this.buildSystemPrompt(sessionKey));
      const flushReply = await session.chat(buildMemoryFlushPrompt());
      if (flushReply) {
        console.log(
          `[Memory] Flush complete for ${sessionKey}: ${flushReply.slice(0, 80)}`,
        );
      }
    } catch (err) {
      console.error(`[Memory] Flush error for ${sessionKey}:`, err);
    }
  }

  /**
   * Lightweight chat: skips persona/skills/memory in system prompt.
   * Used by cron tasks with lightContext: true for faster execution.
   */
  async chatLight(sessionKey: string, prompt: string): Promise<string | null> {
    await this.evictIfNeeded();

    // Create a session with minimal system prompt (no persona, skills, memory)
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      // LRU update: move to end
      this.sessions.delete(sessionKey);
      this.sessions.set(sessionKey, existing);
    } else {
      const userId = extractUserId(sessionKey);
      const cwd = userId ? ensureWorkspace(userId) : undefined;
      const chat = new ClaudeChat({
        systemPrompt: "You are a helpful assistant. Be concise.",
        model: this.options.model,
        ...(cwd ? { cwd } : {}),
        ...(this.options.mcpServers
          ? { mcpServers: this.options.mcpServers }
          : {}),
      });

      // Restore from store if available
      if (this.store) {
        const persisted = this.store.get(sessionKey);
        if (persisted && this.store.isFresh(sessionKey, this.idleMs)) {
          chat.restoreSessionId(persisted.sessionId);
          if (persisted.model) chat.setModel(persisted.model);
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
