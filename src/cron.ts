/**
 * Cron scheduler for Klaus.
 *
 * Runs scheduled prompts via ChatSessionManager on cron expressions.
 * Each task gets an isolated session key (`cron:{id}`).
 * Results are stored in message transcripts and optionally logged.
 *
 * Inspired by OpenClaw's cron system, simplified for Klaus.
 */

import { Cron, type CronOptions } from "croner";
import type { CronTask } from "./types.js";
import type { ChatSessionManager } from "./core.js";

// ---------------------------------------------------------------------------
// Run record (in-memory, most recent per task)
// ---------------------------------------------------------------------------

export interface CronRunRecord {
  readonly taskId: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly status: "ok" | "error";
  readonly resultPreview?: string;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// CronScheduler
// ---------------------------------------------------------------------------

export class CronScheduler {
  private readonly jobs = new Map<string, Cron>();
  private readonly lastRuns = new Map<string, CronRunRecord>();
  private readonly running = new Set<string>();
  private readonly tasks: readonly CronTask[];
  private readonly sessions: ChatSessionManager;

  constructor(tasks: readonly CronTask[], sessions: ChatSessionManager) {
    this.tasks = this.deduplicateTasks(tasks);
    this.sessions = sessions;
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

  start(): void {
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
  }

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

    const job = new Cron(schedule, opts, () => {
      void this.executeTask(task);
    });

    this.jobs.set(task.id, job);
  }

  private resolveScheduleExpr(task: CronTask): string {
    if (typeof task.schedule === "string") return task.schedule;
    switch (task.schedule.kind) {
      case "cron":
        return task.schedule.expr;
      case "every": {
        // Convert milliseconds interval to a cron-compatible seconds-based pattern
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

  private async executeTask(task: CronTask): Promise<void> {
    // Skip if this task is already running (prevent overlap)
    if (this.running.has(task.id)) {
      console.log(`[Cron] Task "${task.id}" skipped (still running)`);
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

    try {
      const reply = await this.sessions.chat(sessionKey, task.prompt);
      const finishedAt = Date.now();
      const durationSec = ((finishedAt - startedAt) / 1000).toFixed(1);

      const record: CronRunRecord = {
        taskId: task.id,
        startedAt,
        finishedAt,
        status: "ok",
        resultPreview: reply?.slice(0, 200),
      };
      this.lastRuns.set(task.id, record);

      console.log(
        `[Cron] Task "${task.id}" completed in ${durationSec}s: ${reply?.slice(0, 120) ?? "(no reply)"}`,
      );
    } catch (err) {
      const finishedAt = Date.now();
      const errMsg = err instanceof Error ? err.message : String(err);

      const record: CronRunRecord = {
        taskId: task.id,
        startedAt,
        finishedAt,
        status: "error",
        error: errMsg,
      };
      this.lastRuns.set(task.id, record);

      console.error(`[Cron] Task "${task.id}" failed: ${errMsg}`);
    } finally {
      this.running.delete(task.id);
    }
  }

  /** Get status of all tasks (for /cron command). */
  getStatus(): readonly {
    id: string;
    name?: string;
    schedule: string;
    enabled: boolean;
    nextRun: string | null;
    lastRun: CronRunRecord | null;
  }[] {
    return this.tasks.map((task) => {
      const job = this.jobs.get(task.id);
      const next = job?.nextRun();
      return {
        id: task.id,
        name: task.name,
        schedule: this.resolveScheduleExpr(task),
        enabled: task.enabled !== false,
        nextRun: next ? next.toISOString() : null,
        lastRun: this.lastRuns.get(task.id) ?? null,
      };
    });
  }

  stop(): void {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
    console.log("[Cron] Stopped all tasks");
  }
}
