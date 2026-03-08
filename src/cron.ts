/**
 * Cron scheduler for Klaus — fully aligned with OpenClaw.
 *
 * Features:
 * - Cron/every/at scheduling via croner
 * - Isolated sessions per task (`cron:{id}`)
 * - Overlap protection (skip if already running)
 * - Task deduplication (last definition wins)
 * - Result delivery: announce (channel) / webhook / none
 * - Failure retry with exponential backoff + error classification
 * - One-shot (at) task auto-disable/delete
 * - Deterministic stagger for top-of-hour expressions
 * - JSONL run log with auto-pruning
 * - Failure alerts after N consecutive errors
 * - Session retention pruning
 * - Light context mode
 * - Model/thinking override per task
 * - CLI management: add/edit/remove/run/runs/status
 */

import { Cron, type CronOptions } from "croner";
import type {
  CronTask,
  CronConfig,
  CronRetryConfig,
  CronFailureAlert,
} from "./types.js";
import type { ChatSessionManager } from "./core.js";
import type { SessionStore } from "./session-store.js";
import { classifyCronError } from "./cron-errors.js";
import { CronRunLog, type CronRunLogEntry } from "./cron-log.js";
import { resolveStaggerMs } from "./cron-stagger.js";
import { sleep } from "./retry.js";

/** Delivery function: send a message to a channel target. */
export type DeliverFn = (to: string, text: string) => Promise<void>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_RETRY: CronRetryConfig = {
  maxAttempts: 3,
  backoffMs: [30_000, 60_000, 300_000, 900_000, 3_600_000],
  retryOn: ["rate_limit", "network", "server_error"],
};

const DEFAULT_FAILURE_ALERT: CronFailureAlert = {
  enabled: false,
  after: 2,
  cooldownMs: 60 * 60 * 1000,
};

const DEFAULT_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_PRUNE_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Run record (in-memory, most recent per task)
// ---------------------------------------------------------------------------

export interface CronRunRecord {
  readonly taskId: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly status: "ok" | "error" | "skipped";
  readonly resultPreview?: string;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Per-task runtime state
// ---------------------------------------------------------------------------

interface TaskState {
  consecutiveErrors: number;
  lastFailureAlertAtMs: number;
}

// ---------------------------------------------------------------------------
// CronScheduler
// ---------------------------------------------------------------------------

export class CronScheduler {
  private readonly jobs = new Map<string, Cron>();
  private readonly lastRuns = new Map<string, CronRunRecord>();
  private readonly running = new Set<string>();
  private tasks: CronTask[];
  private readonly sessions: ChatSessionManager;
  private readonly deliverers: ReadonlyMap<string, DeliverFn>;
  private readonly config: CronConfig;
  private readonly retryConfig: CronRetryConfig;
  private readonly failureAlertConfig: CronFailureAlert;
  private readonly runLog: CronRunLog;
  private readonly taskState = new Map<string, TaskState>();
  private readonly sessionStore: SessionStore | undefined;
  private lastSessionPruneAt = 0;
  private started = false;

  constructor(
    config: CronConfig,
    sessions: ChatSessionManager,
    deliverers?: ReadonlyMap<string, DeliverFn>,
    sessionStore?: SessionStore,
  ) {
    this.tasks = [...this.deduplicateTasks(config.tasks)];
    this.sessions = sessions;
    this.deliverers = deliverers ?? new Map();
    this.config = config;
    this.retryConfig = config.retry ?? DEFAULT_RETRY;
    this.failureAlertConfig = config.failureAlert ?? DEFAULT_FAILURE_ALERT;
    this.runLog = new CronRunLog(
      config.runLog
        ? {
            maxBytes: config.runLog.maxBytes,
            keepLines: config.runLog.keepLines,
          }
        : undefined,
    );
    this.sessionStore = sessionStore;
  }

  /** Deduplicate tasks by ID, warn on conflicts, keep last occurrence. */
  private deduplicateTasks(tasks: readonly CronTask[]): readonly CronTask[] {
    const seen = new Map<string, number>();
    const result: CronTask[] = [];
    for (const task of tasks) {
      const prev = seen.get(task.id);
      if (prev !== undefined) {
        console.warn(
          `[Cron] Duplicate task ID "${task.id}", overriding previous definition`,
        );
        result[prev] = task;
      } else {
        seen.set(task.id, result.length);
        result.push(task);
      }
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(): void {
    this.started = true;
    for (const task of this.tasks) {
      if (task.enabled === false) continue;
      this.scheduleTask(task);
    }

    const count = this.jobs.size;
    if (count > 0) {
      console.log(`[Cron] Started ${count} task(s)`);
      for (const task of this.tasks) {
        if (task.enabled === false) continue;
        const job = this.jobs.get(task.id);
        const next = job?.nextRun();
        console.log(
          `[Cron]   ${task.id}: "${task.name ?? task.prompt.slice(0, 40)}" → next: ${next ? next.toISOString() : "never"}`,
        );
      }
    }

    // Initial session prune
    this.pruneCronSessions();
  }

  stop(): void {
    this.started = false;
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
    console.log("[Cron] Stopped all tasks");
  }

  // -----------------------------------------------------------------------
  // Scheduling
  // -----------------------------------------------------------------------

  private scheduleTask(task: CronTask): void {
    const schedule = this.resolveScheduleExpr(task);

    const opts: CronOptions = {
      name: task.id,
      catch: (err: unknown) => {
        console.error(`[Cron] Task "${task.id}" threw:`, err);
      },
    };

    // Handle timezone for object-style schedule
    if (
      typeof task.schedule === "object" &&
      task.schedule.kind === "cron" &&
      task.schedule.tz
    ) {
      opts.timezone = task.schedule.tz;
    }

    // One-shot: maxRuns = 1 for at-type schedules
    if (this.isOneShotTask(task)) {
      opts.maxRuns = 1;
    }

    const stagger = resolveStaggerMs(task.schedule, task.id, task.staggerMs);

    const job = new Cron(schedule, opts, () => {
      void this.executeWithStagger(task, stagger);
    });

    this.jobs.set(task.id, job);
  }

  private async executeWithStagger(
    task: CronTask,
    staggerMs: number,
  ): Promise<void> {
    if (staggerMs > 0) {
      console.log(
        `[Cron] Task "${task.id}" staggering ${Math.round(staggerMs / 1000)}s`,
      );
      await sleep(staggerMs);
    }
    await this.executeTask(task);
  }

  private resolveScheduleExpr(task: CronTask): string {
    if (typeof task.schedule === "string") return task.schedule;
    switch (task.schedule.kind) {
      case "cron":
        return task.schedule.expr;
      case "every": {
        const secs = Math.max(1, Math.round(task.schedule.intervalMs / 1000));
        if (secs < 60) return `*/${secs} * * * * *`;
        const mins = Math.round(secs / 60);
        if (mins < 60) return `*/${mins} * * * *`;
        const hrs = Math.round(mins / 60);
        return `0 */${hrs} * * *`;
      }
      case "at":
        return task.schedule.at;
    }
  }

  private isOneShotTask(task: CronTask): boolean {
    if (typeof task.schedule === "object" && task.schedule.kind === "at") {
      return true;
    }
    // ISO 8601 date string heuristic
    if (
      typeof task.schedule === "string" &&
      /^\d{4}-\d{2}-\d{2}T/.test(task.schedule)
    ) {
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  private async executeTask(task: CronTask): Promise<void> {
    // Overlap guard
    if (this.running.has(task.id)) {
      console.log(`[Cron] Task "${task.id}" skipped (still running)`);
      this.logRun(task, 0, "skipped");
      return;
    }

    const sessionKey = `cron:${task.id}`;
    const startedAt = Date.now();
    this.running.add(task.id);

    console.log(
      `[Cron] Executing task "${task.id}": ${task.prompt.slice(0, 80)}`,
    );

    // Set task-specific model if configured
    if (task.model) {
      this.sessions.setModel(sessionKey, task.model);
    }

    // Light context mode
    const useLight = task.lightContext === true;

    try {
      const reply = useLight
        ? await this.sessions.chatLight(sessionKey, task.prompt)
        : await this.sessions.chat(sessionKey, task.prompt);
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;
      const durationSec = (durationMs / 1000).toFixed(1);

      const record: CronRunRecord = {
        taskId: task.id,
        startedAt,
        finishedAt,
        status: "ok",
        resultPreview: reply?.slice(0, 200),
      };
      this.lastRuns.set(task.id, record);

      // Reset consecutive errors on success
      this.updateTaskState(task.id, { consecutiveErrors: 0 });

      console.log(
        `[Cron] Task "${task.id}" completed in ${durationSec}s: ${reply?.slice(0, 120) ?? "(no reply)"}`,
      );

      // Deliver result
      const deliveryResult = await this.handleDelivery(task, reply);

      // Log run
      this.logRun(
        task,
        durationMs,
        "ok",
        undefined,
        reply?.slice(0, 200),
        deliveryResult,
      );

      // One-shot: disable or delete after success
      if (this.isOneShotTask(task)) {
        this.handleOneShotCompletion(task);
      }
    } catch (err) {
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;
      const errMsg = err instanceof Error ? err.message : String(err);

      const record: CronRunRecord = {
        taskId: task.id,
        startedAt,
        finishedAt,
        status: "error",
        error: errMsg,
      };
      this.lastRuns.set(task.id, record);

      // Classify and handle error
      const errorKind = classifyCronError(err);
      const state = this.getTaskState(task.id);
      this.updateTaskState(task.id, {
        consecutiveErrors: state.consecutiveErrors + 1,
      });

      console.error(
        `[Cron] Task "${task.id}" failed (${errorKind}): ${errMsg}`,
      );

      this.logRun(task, durationMs, "error", errMsg);

      // Retry logic for one-shot tasks
      if (this.isOneShotTask(task)) {
        this.handleOneShotError(task, errorKind);
      }

      // Failure alert
      this.checkFailureAlert(task, errMsg);
    } finally {
      this.running.delete(task.id);
      // Periodic session prune
      this.pruneCronSessions();
    }
  }

  // -----------------------------------------------------------------------
  // Delivery routing
  // -----------------------------------------------------------------------

  private async handleDelivery(
    task: CronTask,
    reply: string | null,
  ): Promise<{
    delivered: boolean;
    deliveryStatus: CronRunLogEntry["deliveryStatus"];
    deliveryError?: string;
  }> {
    if (!reply) {
      return { delivered: false, deliveryStatus: "not-requested" };
    }

    const hasChannelDeliver =
      task.deliver &&
      task.deliver.mode !== "none" &&
      task.deliver.mode !== "webhook";
    const hasWebhook = task.webhookUrl || task.deliver?.mode === "webhook";

    if (!hasChannelDeliver && !hasWebhook) {
      return { delivered: false, deliveryStatus: "not-requested" };
    }

    try {
      // Channel announce delivery
      if (hasChannelDeliver) {
        await this.deliverResult(task, reply);
      }
      // Webhook delivery
      if (hasWebhook) {
        await this.deliverWebhook(task, reply);
      }
      return { delivered: true, deliveryStatus: "delivered" };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        delivered: false,
        deliveryStatus: "not-delivered",
        deliveryError: errMsg,
      };
    }
  }

  // -----------------------------------------------------------------------
  // One-shot handling
  // -----------------------------------------------------------------------

  private handleOneShotCompletion(task: CronTask): void {
    const deleteAfterRun = task.deleteAfterRun !== false; // default true for one-shot
    if (deleteAfterRun) {
      this.removeTaskInternal(task.id);
      console.log(`[Cron] One-shot task "${task.id}" completed, removed`);
    } else {
      this.disableTaskInternal(task.id);
      console.log(`[Cron] One-shot task "${task.id}" completed, disabled`);
    }
  }

  private handleOneShotError(
    task: CronTask,
    errorKind: "transient" | "permanent",
  ): void {
    if (errorKind === "permanent") {
      this.disableTaskInternal(task.id);
      console.log(
        `[Cron] One-shot task "${task.id}" disabled (permanent error)`,
      );
      return;
    }

    // Transient: schedule retry with backoff
    const state = this.getTaskState(task.id);
    const attempt = state.consecutiveErrors;
    if (attempt >= this.retryConfig.maxAttempts) {
      this.disableTaskInternal(task.id);
      console.log(
        `[Cron] One-shot task "${task.id}" disabled (max retries exhausted)`,
      );
      return;
    }

    const backoffArr = this.retryConfig.backoffMs;
    if (backoffArr.length === 0) {
      this.disableTaskInternal(task.id);
      console.log(
        `[Cron] One-shot task "${task.id}" disabled (no backoff config)`,
      );
      return;
    }
    const backoffIdx = Math.min(attempt - 1, backoffArr.length - 1);
    const delayMs = backoffArr[backoffIdx];
    console.log(
      `[Cron] One-shot task "${task.id}" retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${this.retryConfig.maxAttempts})`,
    );

    setTimeout(() => {
      void this.executeTask(task);
    }, delayMs);
  }

  // -----------------------------------------------------------------------
  // Delivery: channel announce
  // -----------------------------------------------------------------------

  private async deliverResult(task: CronTask, reply: string): Promise<void> {
    const { channel, to } = task.deliver!;
    const deliverFn = this.deliverers.get(channel);
    if (!deliverFn) {
      console.warn(
        `[Cron] Task "${task.id}": delivery channel "${channel}" not available`,
      );
      return;
    }

    const target = to ?? "*";
    const label = task.name ?? task.id;
    const message = `[定时任务: ${label}]\n\n${reply}`;

    await deliverFn(target, message);
    console.log(`[Cron] Task "${task.id}" delivered to ${channel}:${target}`);
  }

  // -----------------------------------------------------------------------
  // Delivery: webhook (HTTP POST)
  // -----------------------------------------------------------------------

  private async deliverWebhook(task: CronTask, reply: string): Promise<void> {
    const url = task.webhookUrl ?? task.deliver?.to;
    if (!url) {
      throw new Error(
        `Task "${task.id}": webhook mode set but no URL configured`,
      );
    }

    // Validate URL format and block internal/private addresses (SSRF prevention)
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid webhook URL: "${url}"`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Invalid webhook URL protocol: "${parsed.protocol}"`);
    }
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = [
      "localhost",
      "127.0.0.1",
      "::1",
      "0.0.0.0",
      "169.254.169.254", // AWS IMDS
      "metadata.google.internal",
    ];
    if (blockedHosts.includes(host)) {
      throw new Error(`Webhook URL blocked (internal address): "${host}"`);
    }
    // Block RFC-1918 / link-local ranges
    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith("169.254.")
    ) {
      throw new Error(`Webhook URL blocked (private network): "${host}"`);
    }

    const token = task.webhookToken ?? this.config.webhookToken;

    const payload = {
      jobId: task.id,
      name: task.name,
      status: "ok",
      reply,
      timestamp: Date.now(),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook POST failed: ${response.status} ${response.statusText}`,
      );
    }

    console.log(`[Cron] Task "${task.id}" webhook delivered to ${url}`);
  }

  // -----------------------------------------------------------------------
  // Failure alerts
  // -----------------------------------------------------------------------

  private checkFailureAlert(task: CronTask, errorMsg: string): void {
    if (task.failureAlert === false) return;

    const alertConfig =
      (task.failureAlert as CronFailureAlert | undefined) ??
      this.failureAlertConfig;
    if (!alertConfig.enabled) return;

    const state = this.getTaskState(task.id);
    if (state.consecutiveErrors < alertConfig.after) return;

    const now = Date.now();
    if (now - state.lastFailureAlertAtMs < alertConfig.cooldownMs) return;

    this.updateTaskState(task.id, { lastFailureAlertAtMs: now });

    const label = task.name ?? task.id;
    const message =
      `[告警] 定时任务 "${label}" 连续失败 ${state.consecutiveErrors} 次\n` +
      `最近错误: ${errorMsg}`;

    const channel = alertConfig.channel;
    const to = alertConfig.to ?? "*";

    if (channel) {
      const deliverFn = this.deliverers.get(channel);
      if (deliverFn) {
        deliverFn(to, message).catch((err) => {
          console.error(
            `[Cron] Failure alert delivery failed for "${task.id}":`,
            err,
          );
        });
      } else {
        console.warn(`[Cron] Failure alert channel "${channel}" not available`);
      }
    }

    console.warn(`[Cron] ALERT: ${message}`);
  }

  // -----------------------------------------------------------------------
  // Run logging
  // -----------------------------------------------------------------------

  private logRun(
    task: CronTask,
    durationMs: number,
    status: "ok" | "error" | "skipped",
    error?: string,
    summary?: string,
    delivery?: {
      delivered?: boolean;
      deliveryStatus?: CronRunLogEntry["deliveryStatus"];
      deliveryError?: string;
    },
  ): void {
    const entry: CronRunLogEntry = {
      ts: Date.now(),
      jobId: task.id,
      action: "finished",
      status,
      durationMs,
      ...(error ? { error } : {}),
      ...(summary ? { summary } : {}),
      ...(task.model ? { model: task.model } : {}),
      ...(delivery?.delivered != null ? { delivered: delivery.delivered } : {}),
      ...(delivery?.deliveryStatus
        ? { deliveryStatus: delivery.deliveryStatus }
        : {}),
      ...(delivery?.deliveryError
        ? { deliveryError: delivery.deliveryError }
        : {}),
    };

    try {
      this.runLog.append(entry);
    } catch (err) {
      console.error(`[Cron] Failed to write run log for "${task.id}":`, err);
    }
  }

  // -----------------------------------------------------------------------
  // Session retention
  // -----------------------------------------------------------------------

  private pruneCronSessions(): void {
    const now = Date.now();
    if (now - this.lastSessionPruneAt < SESSION_PRUNE_MIN_INTERVAL_MS) return;
    this.lastSessionPruneAt = now;

    if (!this.sessionStore) return;

    const retentionMs =
      this.config.sessionRetentionMs ?? DEFAULT_SESSION_RETENTION_MS;
    this.sessionStore.pruneStale(retentionMs);
  }

  // -----------------------------------------------------------------------
  // Task state helpers
  // -----------------------------------------------------------------------

  private getTaskState(taskId: string): Readonly<TaskState> {
    return (
      this.taskState.get(taskId) ?? {
        consecutiveErrors: 0,
        lastFailureAlertAtMs: 0,
      }
    );
  }

  private updateTaskState(taskId: string, patch: Partial<TaskState>): void {
    const current = this.getTaskState(taskId);
    this.taskState.set(taskId, { ...current, ...patch });
  }

  private disableTaskInternal(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      this.jobs.delete(taskId);
    }
    this.tasks = this.tasks.map((t) =>
      t.id === taskId ? { ...t, enabled: false } : t,
    );
  }

  private removeTaskInternal(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      this.jobs.delete(taskId);
    }
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.taskState.delete(taskId);
  }

  // -----------------------------------------------------------------------
  // CLI management: add / edit / remove / run / runs / status
  // -----------------------------------------------------------------------

  addTask(task: CronTask): void {
    this.removeTaskInternal(task.id);
    this.tasks.push(task);
    if (task.enabled !== false && this.started) {
      this.scheduleTask(task);
    }
    console.log(`[Cron] Task "${task.id}" added`);
  }

  editTask(id: string, patch: Partial<CronTask>): boolean {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;

    const updated = { ...this.tasks[idx], ...patch };
    this.tasks[idx] = updated;

    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
    if (updated.enabled !== false && this.started) {
      this.scheduleTask(updated);
    }

    console.log(`[Cron] Task "${id}" edited`);
    return true;
  }

  removeTask(id: string): boolean {
    const exists = this.tasks.some((t) => t.id === id);
    if (!exists) return false;
    this.removeTaskInternal(id);
    console.log(`[Cron] Task "${id}" removed`);
    return true;
  }

  async runTask(id: string): Promise<CronRunRecord | null> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    await this.executeTask(task);
    return this.lastRuns.get(id) ?? null;
  }

  getRunHistory(id: string, limit: number = 20): CronRunLogEntry[] {
    return this.runLog.read(id, limit);
  }

  /** Get status of all tasks (for /cron list). */
  getStatus(): readonly {
    id: string;
    name?: string;
    schedule: string;
    enabled: boolean;
    nextRun: string | null;
    lastRun: CronRunRecord | null;
    consecutiveErrors: number;
  }[] {
    return this.tasks.map((task) => {
      const job = this.jobs.get(task.id);
      const next = job?.nextRun();
      const state = this.taskState.get(task.id);
      return {
        id: task.id,
        name: task.name,
        schedule: this.resolveScheduleExpr(task),
        enabled: task.enabled !== false,
        nextRun: next ? next.toISOString() : null,
        lastRun: this.lastRuns.get(task.id) ?? null,
        consecutiveErrors: state?.consecutiveErrors ?? 0,
      };
    });
  }

  /** Get scheduler-level status. */
  getSchedulerStatus(): {
    running: boolean;
    taskCount: number;
    activeJobs: number;
    nextWakeAt: string | null;
  } {
    let earliest: Date | null = null;
    for (const job of this.jobs.values()) {
      const next = job.nextRun();
      if (next && (!earliest || next < earliest)) {
        earliest = next;
      }
    }
    return {
      running: this.started,
      taskCount: this.tasks.length,
      activeJobs: this.jobs.size,
      nextWakeAt: earliest ? earliest.toISOString() : null,
    };
  }
}
