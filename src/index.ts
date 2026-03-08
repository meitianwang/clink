import { existsSync } from "node:fs";
import { qqPlugin } from "./channels/qq.js";
import { wecomPlugin } from "./channels/wecom.js";
import { webPlugin } from "./channels/web.js";
import {
  registerChannel,
  getChannel,
  type ChannelPlugin,
} from "./channels/types.js";
import {
  getChannelNames,
  CONFIG_FILE,
  loadSessionConfig,
  loadTranscriptsConfig,
  loadCronConfig,
} from "./config.js";
import { ensureConfigValid } from "./config-validate.js";
import { ChatSessionManager } from "./core.js";
import { t } from "./i18n.js";
import { type InboundMessage, formatPrompt } from "./message.js";
import {
  loadEnabledSkills,
  listSkillNames,
  applySkillEnvOverrides,
} from "./skills/index.js";
import type {
  ToolEventCallback,
  StreamChunkCallback,
  PermissionRequestCallback,
} from "./types.js";

// ---------------------------------------------------------------------------
// Channel registration
// ---------------------------------------------------------------------------

registerChannel(qqPlugin);
registerChannel(wecomPlugin);
registerChannel(webPlugin);

// ---------------------------------------------------------------------------
// Model alias mapping
// ---------------------------------------------------------------------------

const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

async function start(): Promise<void> {
  if (!existsSync(CONFIG_FILE)) {
    console.log("No config found. Starting setup wizard...\n");
    const { runSetup } = await import("./setup-wizard.js");
    await runSetup();
    if (!existsSync(CONFIG_FILE)) return;
  }

  // Validate config before attempting to connect (fail-fast)
  ensureConfigValid();

  // Apply skill environment overrides (scoped to process lifetime)
  applySkillEnvOverrides();

  const channelNames = getChannelNames();
  const plugins: ChannelPlugin[] = [];
  for (const name of channelNames) {
    const plugin = getChannel(name);
    if (!plugin) {
      console.error(`Internal error: channel "${name}" not registered.`);
      process.exit(1);
    }
    plugins.push(plugin);
  }

  // Initialize session persistence
  const sessionCfg = loadSessionConfig();
  const { SessionStore } = await import("./session-store.js");
  const store = new SessionStore();
  await store.load();
  store.pruneStale(sessionCfg.maxAgeMs);
  store.capEntries(sessionCfg.maxEntries);
  await store.save();

  // Initialize message persistence (JSONL transcripts)
  const { MessageStore } = await import("./message-store.js");
  const messageStore = new MessageStore(loadTranscriptsConfig());
  messageStore.prune();

  // Initialize per-user memory store
  const { MemoryStore } = await import("./memory-store.js");
  const memoryStore = new MemoryStore();

  const sessions = new ChatSessionManager(
    store,
    sessionCfg.idleMs,
    messageStore,
    memoryStore,
  );

  // Initialize cron scheduler (if configured)
  let cronScheduler: import("./cron.js").CronScheduler | null = null;
  const cronCfg = loadCronConfig();
  if (cronCfg.enabled) {
    // Build delivery registry from active channel plugins
    const deliverers = new Map<
      string,
      (to: string, text: string) => Promise<void>
    >();
    for (const p of plugins) {
      if (p.deliver) {
        deliverers.set(p.meta.id, p.deliver);
      }
    }
    const { CronScheduler } = await import("./cron.js");
    cronScheduler = new CronScheduler(cronCfg, sessions, deliverers, store);
    cronScheduler.start();
  }

  // Expose stores to web channel for API endpoints
  let inviteStoreInstance: { close(): void } | null = null;
  let userStoreInstance: { close(): void } | null = null;
  if (channelNames.includes("web")) {
    const {
      setMessageStore,
      setInviteStore,
      setSessionStore,
      setUserStore,
      setChatManager,
    } = await import("./channels/web.js");
    setMessageStore(messageStore);
    setSessionStore(store);
    setChatManager(sessions);

    const { InviteStore } = await import("./invite-store.js");
    const inviteStore = new InviteStore();
    setInviteStore(inviteStore);
    inviteStoreInstance = inviteStore;

    const { UserStore } = await import("./user-store.js");
    const { loadWebConfig } = await import("./config.js");
    const webCfg = loadWebConfig();
    const sessionMaxAgeMs = webCfg.sessionMaxAgeDays * 24 * 60 * 60 * 1000;
    const userStore = new UserStore(undefined, sessionMaxAgeMs);
    setUserStore(userStore);
    userStoreInstance = userStore;

    // Prune expired auth sessions on startup
    const pruned = userStore.pruneExpiredSessions();
    if (pruned > 0) {
      console.log(`[UserStore] Pruned ${pruned} expired auth session(s)`);
    }
  }

  const handler = async (
    msg: InboundMessage,
    onToolEvent?: ToolEventCallback,
    onStreamChunk?: StreamChunkCallback,
    onPermissionRequest?: PermissionRequestCallback,
  ): Promise<string | null> => {
    const trimmed = msg.text.trim();

    // /new, /reset, /clear — reset conversation
    if (["/new", "/reset", "/clear"].includes(trimmed)) {
      await sessions.reset(msg.sessionKey);
      return t("cmd_reset");
    }

    // /help — list commands
    if (trimmed === "/help") {
      return t("cmd_help");
    }

    // /session — show session info
    if (trimmed === "/session") {
      const info = sessions.getSessionInfo(msg.sessionKey);
      return t("cmd_session_info", {
        key: msg.sessionKey,
        status: info.busy ? t("cmd_session_active") : t("cmd_session_idle"),
        model: info.model ?? t("cmd_default_model"),
      });
    }

    // /skills — list enabled skills
    if (trimmed === "/skills") {
      const enabled = loadEnabledSkills();
      if (enabled.length === 0) {
        return t("cmd_skills_none", {
          available: listSkillNames().join(", "),
        });
      }
      const list = enabled
        .map((s) => {
          const emoji = s.metadata?.emoji ? `${s.metadata.emoji} ` : "";
          const src = s.source === "user" ? " (user)" : "";
          return `  ${emoji}${s.name} — ${s.description}${src}`;
        })
        .join("\n");
      return t("cmd_skills_list", { list, count: String(enabled.length) });
    }

    // /cron [subcommand] — cron task management
    if (trimmed === "/cron" || trimmed.startsWith("/cron ")) {
      return handleCronCommand(trimmed, cronScheduler);
    }

    // /model [name] — show or switch model
    if (trimmed === "/model" || trimmed.startsWith("/model ")) {
      const arg = trimmed.slice("/model".length).trim();
      if (!arg) {
        const current = sessions.getModel(msg.sessionKey);
        return t("cmd_model_current", {
          model: current ?? t("cmd_default_model"),
        });
      }
      const resolved = MODEL_ALIASES[arg.toLowerCase()] ?? MODEL_ALIASES[arg];
      if (!resolved) {
        return t("cmd_model_unknown", { name: arg });
      }
      sessions.setModel(msg.sessionKey, resolved);
      return t("cmd_model_switched", { model: resolved });
    }

    const prompt = formatPrompt(msg);
    if (!prompt) return null;
    return sessions.chat(
      msg.sessionKey,
      prompt,
      onToolEvent,
      onStreamChunk,
      onPermissionRequest,
    );
  };

  try {
    // Start all channels in parallel (each blocks forever).
    // If any rejects, Promise.all rejects → finally runs → process.exit(1) in main().
    await Promise.all(plugins.map((p) => p.start(handler)));
  } finally {
    cronScheduler?.stop();
    await sessions.close();
    inviteStoreInstance?.close();
    userStoreInstance?.close();
  }
}

// ---------------------------------------------------------------------------
// /cron subcommand handler
// ---------------------------------------------------------------------------

const SAFE_CRON_ID_RE = /^[a-zA-Z0-9._-]+$/;

function validateCronId(id: string): string | null {
  if (!id || !SAFE_CRON_ID_RE.test(id)) {
    return `Invalid task ID "${id}". Use only letters, numbers, dash, underscore, dot.`;
  }
  return null;
}

async function handleCronCommand(
  trimmed: string,
  cronScheduler: import("./cron.js").CronScheduler | null,
): Promise<string> {
  if (!cronScheduler) {
    return t("cmd_cron_disabled");
  }

  const args = trimmed.slice("/cron".length).trim();

  // /cron or /cron list — list all tasks
  if (!args || args === "list") {
    const status = cronScheduler.getStatus();
    if (status.length === 0) return t("cmd_cron_empty");
    const lines = status.map((s) => {
      const state = s.enabled ? "✓" : "✗";
      const errors = s.consecutiveErrors > 0 ? ` ⚠${s.consecutiveErrors}` : "";
      const last = s.lastRun
        ? `${s.lastRun.status === "ok" ? "✓" : "✗"} ${new Date(s.lastRun.finishedAt).toLocaleString()}`
        : "-";
      const next = s.nextRun ? new Date(s.nextRun).toLocaleString() : "-";
      return `  ${state} ${s.id}${s.name ? ` (${s.name})` : ""}${errors}\n    schedule: ${s.schedule}\n    last: ${last} | next: ${next}`;
    });
    return t("cmd_cron_list", {
      count: String(status.length),
      list: lines.join("\n"),
    });
  }

  // /cron help
  if (args === "help") {
    return t("cmd_cron_help");
  }

  // /cron status — scheduler status
  if (args === "status") {
    const s = cronScheduler.getSchedulerStatus();
    return t("cmd_cron_status", {
      state: s.running ? "Running" : "Stopped",
      total: String(s.taskCount),
      active: String(s.activeJobs),
      next: s.nextWakeAt ? new Date(s.nextWakeAt).toLocaleString() : "-",
    });
  }

  // /cron run <id> — trigger task
  if (args.startsWith("run ")) {
    const id = args.slice(4).trim();
    if (!id) return t("cmd_cron_help");
    const idErr = validateCronId(id);
    if (idErr) return idErr;
    const result = await cronScheduler.runTask(id);
    if (!result) return t("cmd_cron_not_found", { id });
    return t("cmd_cron_triggered", {
      id,
      status:
        result.status === "ok"
          ? `✓ ${result.resultPreview?.slice(0, 100) ?? ""}`
          : `✗ ${result.error ?? "unknown error"}`,
    });
  }

  // /cron runs <id> — view run history
  if (args.startsWith("runs ")) {
    const id = args.slice(5).trim();
    if (!id) return t("cmd_cron_help");
    const idErr = validateCronId(id);
    if (idErr) return idErr;
    const runs = cronScheduler.getRunHistory(id, 10);
    if (runs.length === 0) return t("cmd_cron_runs_empty", { id });
    const lines = runs.map((r) => {
      const time = new Date(r.ts).toLocaleString();
      const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
      const status =
        r.status === "ok" ? "✓" : r.status === "skipped" ? "⊘" : "✗";
      const detail = r.error ?? r.summary?.slice(0, 80) ?? "";
      const delivery = r.deliveryStatus ? ` [${r.deliveryStatus}]` : "";
      return `  ${status} ${time} (${dur})${delivery}\n    ${detail}`;
    });
    return t("cmd_cron_runs_header", {
      id,
      count: String(runs.length),
      list: lines.join("\n"),
    });
  }

  // /cron add <id> <schedule> <prompt>
  if (args.startsWith("add ")) {
    const parts = args.slice(4).trim().split(/\s+/);
    if (parts.length < 3) return t("cmd_cron_help");
    const id = parts[0];
    const idErr = validateCronId(id);
    if (idErr) return idErr;
    const schedule = parts[1];
    const prompt = parts.slice(2).join(" ");
    cronScheduler.addTask({ id, schedule, prompt, enabled: true });
    return t("cmd_cron_added", { id, schedule, prompt: prompt.slice(0, 60) });
  }

  // /cron edit <id> <field>=<value>
  if (args.startsWith("edit ")) {
    const parts = args.slice(5).trim().split(/\s+/);
    if (parts.length < 2) return t("cmd_cron_help");
    const id = parts[0];
    const idErr = validateCronId(id);
    if (idErr) return idErr;
    const patch: Record<string, unknown> = {};
    for (const kv of parts.slice(1)) {
      const eqIdx = kv.indexOf("=");
      if (eqIdx === -1) continue;
      const key = kv.slice(0, eqIdx);
      const value = kv.slice(eqIdx + 1);
      if (key === "enabled") patch[key] = value === "true";
      else if (
        key === "schedule" ||
        key === "prompt" ||
        key === "model" ||
        key === "name"
      ) {
        patch[key] = value;
      }
    }
    const ok = cronScheduler.editTask(
      id,
      patch as Partial<import("./types.js").CronTask>,
    );
    if (!ok) return t("cmd_cron_not_found", { id });
    return t("cmd_cron_edited", { id });
  }

  // /cron remove <id>
  if (args.startsWith("remove ")) {
    const id = args.slice(7).trim();
    if (!id) return t("cmd_cron_help");
    const idErr = validateCronId(id);
    if (idErr) return idErr;
    const ok = cronScheduler.removeTask(id);
    if (!ok) return t("cmd_cron_not_found", { id });
    return t("cmd_cron_removed", { id });
  }

  // /cron enable <id>
  if (args.startsWith("enable ")) {
    const id = args.slice(7).trim();
    if (!id) return t("cmd_cron_help");
    const idErr = validateCronId(id);
    if (idErr) return idErr;
    const ok = cronScheduler.editTask(id, { enabled: true });
    if (!ok) return t("cmd_cron_not_found", { id });
    return t("cmd_cron_enabled", { id });
  }

  // /cron disable <id>
  if (args.startsWith("disable ")) {
    const id = args.slice(8).trim();
    if (!id) return t("cmd_cron_help");
    const idErr = validateCronId(id);
    if (idErr) return idErr;
    const ok = cronScheduler.editTask(id, { enabled: false });
    if (!ok) return t("cmd_cron_not_found", { id });
    return t("cmd_cron_disabled_task", { id });
  }

  return t("cmd_cron_help");
}

function main(): void {
  const cmd = process.argv[2] ?? "start";

  switch (cmd) {
    case "setup":
      import("./setup-wizard.js")
        .then((m) => m.runSetup())
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
      break;
    case "doctor":
      import("./doctor.js")
        .then((m) => m.runDoctor())
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(err);
          process.exit(1);
        });
      break;
    case "start":
      start().catch((err) => {
        console.error(err);
        process.exit(1);
      });
      break;
    default:
      console.log(
        "Klaus — Use Claude Code from any messaging platform\n\n" +
          "Usage: klaus [command]\n\n" +
          "Commands:\n" +
          "  setup    Interactive setup wizard\n" +
          "  start    Start the bot (default)\n" +
          "  doctor   Diagnose environment issues\n",
      );
      process.exit(1);
  }
}

main();
