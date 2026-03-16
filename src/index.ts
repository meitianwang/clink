import { existsSync } from "node:fs";
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
import {
  type InboundMessage,
  formatPrompt,
  formatDisplayText,
} from "./message.js";
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
import { parseCronMarkers, type CronMarkerAction } from "./cron-marker.js";
import { generateLocalToken, generateExecToken } from "./local-token.js";

// ---------------------------------------------------------------------------
// Channel registration
// ---------------------------------------------------------------------------

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

  // Generate local token for macOS app authentication
  generateLocalToken();

  // Generate exec approval token for macOS app command approval
  generateExecToken();

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

  // Build delivery registry from active channel plugins (needed by cron)
  const deliverers = new Map<
    string,
    (to: string, text: string) => Promise<void>
  >();
  for (const p of plugins) {
    if (p.deliver) {
      deliverers.set(p.meta.id, p.deliver);
    }
  }

  // Initialize cron scheduler (eagerly if configured, lazily on first tool call)
  let cronScheduler: import("./cron.js").CronScheduler | null = null;
  const cronCfg = loadCronConfig();

  /** Lazy-init with Promise cache to prevent concurrent double-init. */
  let schedulerPromise: Promise<import("./cron.js").CronScheduler> | null =
    null;
  const ensureCronScheduler = (): Promise<
    import("./cron.js").CronScheduler
  > => {
    schedulerPromise ??= (async () => {
      const { CronScheduler } = await import("./cron.js");
      cronScheduler = new CronScheduler(
        { ...cronCfg, enabled: true },
        sessions,
        deliverers,
        store,
      );
      cronScheduler.start();
      console.log("[Cron] Scheduler started");
      // Expose to web admin API if web channel is active
      if (channelNames.includes("web")) {
        const { setCronScheduler } = await import("./channels/web.js");
        setCronScheduler(cronScheduler);
      }
      return cronScheduler;
    })();
    return schedulerPromise;
  };

  // Eagerly start if cron is configured
  if (cronCfg.enabled) {
    await ensureCronScheduler();
  }

  // Always inject cron MCP tool so Claude can create tasks via tool_use.
  // Uses lazy scheduler init — first tool call starts the scheduler if needed.
  {
    const { createCronMcpServer } = await import("./cron-tool.js");
    const cronMcp = createCronMcpServer({
      get scheduler() {
        return cronScheduler;
      },
      ensureScheduler: ensureCronScheduler,
    });
    const { createSendFileMcpServer } = await import("./send-file-tool.js");
    const sendFileMcp = createSendFileMcpServer();

    // Skill registry tool (lazy init — first tool call creates RegistryManager)
    const { createSkillRegistryMcpServer } =
      await import("./skill-registry-tool.js");
    let registryManager:
      | import("./skills/registry/registry-manager.js").RegistryManager
      | null = null;
    const skillRegistryMcp = createSkillRegistryMcpServer({
      get manager() {
        return registryManager;
      },
      async ensureManager() {
        if (registryManager) return registryManager;
        const { RegistryManager } =
          await import("./skills/registry/registry-manager.js");
        const { loadRegistryConfigs } = await import("./config.js");
        registryManager = new RegistryManager(loadRegistryConfigs());
        return registryManager;
      },
    });

    sessions.setMcpServers({
      "klaus-cron": cronMcp,
      "klaus-send-file": sendFileMcp,
      "klaus-skill-registry": skillRegistryMcp,
    });
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
      setCronScheduler,
    } = await import("./channels/web.js");
    setMessageStore(messageStore);
    setSessionStore(store);
    setChatManager(sessions);
    // Expose cron scheduler to web admin API (may be null initially, set after init)
    if (cronScheduler) {
      setCronScheduler(cronScheduler);
    }

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
      const scheduler = await ensureCronScheduler();
      return handleCronCommand(trimmed, scheduler);
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
    const display = formatDisplayText(msg);
    const reply = await sessions.chat(
      msg.sessionKey,
      prompt,
      onToolEvent,
      onStreamChunk,
      onPermissionRequest,
      display,
    );

    // Post-process: extract and execute [[cron:...]] markers
    if (reply) {
      const { text, actions } = parseCronMarkers(reply);
      if (actions.length > 0) {
        const scheduler = await ensureCronScheduler();
        executeCronActions(actions, scheduler);
        return text || null;
      }
    }

    return reply;
  };

  try {
    // Start all channels in parallel (each blocks forever).
    // If any rejects, Promise.all rejects → finally runs → process.exit(1) in main().
    await Promise.all(plugins.map((p) => p.start(handler)));
  } finally {
    (cronScheduler as import("./cron.js").CronScheduler | null)?.stop();
    await sessions.close();
    inviteStoreInstance?.close();
    userStoreInstance?.close();
  }
}

// ---------------------------------------------------------------------------
// Cron marker execution (AI-driven task management)
// ---------------------------------------------------------------------------

function executeCronActions(
  actions: readonly CronMarkerAction[],
  scheduler: import("./cron.js").CronScheduler,
): void {
  for (const action of actions) {
    try {
      switch (action.action) {
        case "add":
          scheduler.addTask(action.task);
          console.log(`[CronMarker] Added task "${action.task.id}"`);
          break;
        case "edit":
          if (scheduler.editTask(action.id, action.patch)) {
            console.log(`[CronMarker] Edited task "${action.id}"`);
          } else {
            console.warn(`[CronMarker] Task "${action.id}" not found for edit`);
          }
          break;
        case "remove":
          if (scheduler.removeTask(action.id)) {
            console.log(`[CronMarker] Removed task "${action.id}"`);
          } else {
            console.warn(
              `[CronMarker] Task "${action.id}" not found for remove`,
            );
          }
          break;
        case "enable":
          if (scheduler.editTask(action.id, { enabled: true })) {
            console.log(`[CronMarker] Enabled task "${action.id}"`);
          } else {
            console.warn(
              `[CronMarker] Task "${action.id}" not found for enable`,
            );
          }
          break;
        case "disable":
          if (scheduler.editTask(action.id, { enabled: false })) {
            console.log(`[CronMarker] Disabled task "${action.id}"`);
          } else {
            console.warn(
              `[CronMarker] Task "${action.id}" not found for disable`,
            );
          }
          break;
      }
    } catch (err) {
      console.error(`[CronMarker] Failed to execute ${action.action}:`, err);
    }
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
  cronScheduler: import("./cron.js").CronScheduler,
): Promise<string> {
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
    const concurrency = s.maxConcurrentRuns
      ? `${s.runningTasks}/${s.maxConcurrentRuns}`
      : String(s.runningTasks);
    return t("cmd_cron_status", {
      state: s.running ? "Running" : "Stopped",
      total: String(s.taskCount),
      active: String(s.activeJobs),
      running: concurrency,
      next: s.nextWakeAt ? new Date(s.nextWakeAt).toLocaleString() : "-",
    });
  }

  // /cron run <id> [--due] — trigger task (optionally only if due)
  if (args.startsWith("run ")) {
    const runArgs = args.slice(4).trim().split(/\s+/);
    const id = runArgs[0];
    if (!id) return t("cmd_cron_help");
    const idErr = validateCronId(id);
    if (idErr) return idErr;
    const onlyIfDue = runArgs.includes("--due");
    const result = await cronScheduler.runTask(id, { onlyIfDue });
    if (!result) {
      return onlyIfDue
        ? t("cmd_cron_not_due", { id })
        : t("cmd_cron_not_found", { id });
    }
    return t("cmd_cron_triggered", {
      id,
      status:
        result.status === "ok"
          ? `✓ ${result.resultPreview?.slice(0, 100) ?? ""}`
          : `✗ ${result.error ?? "unknown error"}`,
    });
  }

  // /cron runs <id> [--status=ok|error|skipped] [--page=N] — view run history
  if (args.startsWith("runs ")) {
    const runsParts = args.slice(5).trim().split(/\s+/);
    const id = runsParts[0];
    if (!id) return t("cmd_cron_help");
    const idErr = validateCronId(id);
    if (idErr) return idErr;

    // Parse optional flags
    let statusFilter: "ok" | "error" | "skipped" | undefined;
    let page = 0;
    const limit = 10;
    for (const flag of runsParts.slice(1)) {
      if (flag.startsWith("--status=")) {
        const val = flag.slice(9);
        if (val === "ok" || val === "error" || val === "skipped") {
          statusFilter = val;
        }
      } else if (flag.startsWith("--page=")) {
        page = Math.max(0, parseInt(flag.slice(7), 10) - 1);
      }
    }

    const result = cronScheduler.queryRunHistory(id, {
      limit,
      offset: page * limit,
      status: statusFilter,
    });

    if (result.entries.length === 0) return t("cmd_cron_runs_empty", { id });
    const lines = result.entries.map((r) => {
      const time = new Date(r.ts).toLocaleString();
      const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
      const status =
        r.status === "ok" ? "✓" : r.status === "skipped" ? "⊘" : "✗";
      const detail = r.error ?? r.summary?.slice(0, 80) ?? "";
      const delivery = r.deliveryStatus ? ` [${r.deliveryStatus}]` : "";
      return `  ${status} ${time} (${dur})${delivery}\n    ${detail}`;
    });
    const pageInfo = result.hasMore
      ? `\n  (page ${page + 1}, ${result.total} total, --page=${page + 2} for more)`
      : "";
    return t("cmd_cron_runs_header", {
      id,
      count: String(result.total),
      list: lines.join("\n") + pageInfo,
    });
  }

  // /cron add <id> <schedule> <prompt> [--model=X] [--light] [--name=X] [--timeout=N]
  if (args.startsWith("add ")) {
    const parts = args.slice(4).trim().split(/\s+/);
    if (parts.length < 3) return t("cmd_cron_help");
    const id = parts[0];
    const idErr = validateCronId(id);
    if (idErr) return idErr;

    // Separate flags from positional args
    const positional: string[] = [];
    let model: string | undefined;
    let light = false;
    let name: string | undefined;
    let timeoutSeconds: number | undefined;
    for (const p of parts.slice(1)) {
      if (p.startsWith("--model=")) model = p.slice(8);
      else if (p === "--light") light = true;
      else if (p.startsWith("--name=")) name = p.slice(7);
      else if (p.startsWith("--timeout=")) {
        const n = parseInt(p.slice(10), 10);
        if (Number.isFinite(n) && n >= 0) timeoutSeconds = n;
      } else positional.push(p);
    }
    if (positional.length < 2) return t("cmd_cron_help");

    const schedule = positional[0];
    const prompt = positional.slice(1).join(" ");
    cronScheduler.addTask({
      id,
      schedule,
      prompt,
      enabled: true,
      ...(model ? { model } : {}),
      ...(light ? { lightContext: true } : {}),
      ...(name ? { name } : {}),
      ...(timeoutSeconds != null ? { timeoutSeconds } : {}),
    });
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
      else if (key === "light_context" || key === "lightContext")
        patch["lightContext"] = value === "true";
      else if (key === "delete_after_run" || key === "deleteAfterRun")
        patch["deleteAfterRun"] = value === "true";
      else if (
        key === "timeout" ||
        key === "timeout_seconds" ||
        key === "timeoutSeconds"
      ) {
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && n >= 0) patch["timeoutSeconds"] = n;
      } else if (
        key === "schedule" ||
        key === "prompt" ||
        key === "model" ||
        key === "name" ||
        key === "description" ||
        key === "webhook_url" ||
        key === "webhookUrl"
      ) {
        const patchKey = key === "webhook_url" ? "webhookUrl" : key;
        patch[patchKey] = value;
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

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "start";

  const runWizard = async (
    fn: (m: typeof import("./setup-wizard.js")) => Promise<void>,
  ) => {
    const m = await import("./setup-wizard.js");
    await fn(m);
    process.exit(0);
  };

  switch (cmd) {
    case "setup": {
      const sub = process.argv[3];
      if (sub === "--add-channel") {
        await runWizard((m) => m.runAddChannel());
      } else if (sub === "--remove-channel") {
        await runWizard((m) => m.runRemoveChannel());
      } else {
        await runWizard((m) => m.runSetup());
      }
      break;
    }
    case "add-channel":
      await runWizard((m) => m.runAddChannel());
      break;
    case "remove-channel":
      await runWizard((m) => m.runRemoveChannel());
      break;
    case "doctor": {
      const doc = await import("./doctor.js");
      await doc.runDoctor();
      process.exit(0);
      break;
    }
    case "start": {
      const flags = process.argv.slice(3);
      const foreground = flags.includes("--foreground") || flags.includes("-f");
      const daemon = await import("./daemon.js");

      if (foreground) {
        daemon.registerForegroundPid();
        await start();
      } else {
        daemon.daemonize();
      }
      break;
    }
    case "stop": {
      const daemon = await import("./daemon.js");
      await daemon.stopDaemon();
      break;
    }
    case "status": {
      const daemon = await import("./daemon.js");
      const flags = process.argv.slice(3);
      if (flags.includes("--json")) {
        daemon.showStatusJson();
      } else {
        daemon.showStatus();
      }
      break;
    }
    case "logs": {
      const daemon = await import("./daemon.js");
      daemon.tailLogs();
      break;
    }
    case "daemon": {
      const sub = process.argv[3];
      const daemon = await import("./daemon.js");
      if (sub === "install") {
        const portFlag = process.argv.find((a) => a.startsWith("--port="));
        const port = portFlag ? parseInt(portFlag.slice(7), 10) : 3000;
        daemon.installLaunchAgent(Number.isFinite(port) ? port : 3000);
      } else if (sub === "uninstall") {
        daemon.uninstallLaunchAgent();
      } else if (sub === "status") {
        const flags = process.argv.slice(4);
        if (flags.includes("--json")) {
          daemon.showStatusJson();
        } else {
          daemon.showStatus();
        }
      } else {
        console.log(
          "Usage: klaus daemon <command>\n\n" +
            "Commands:\n" +
            "  install [--port=N]   Install launchd agent (macOS)\n" +
            "  uninstall            Remove launchd agent\n" +
            "  status [--json]      Show daemon status\n",
        );
      }
      process.exit(0);
      break;
    }
    default:
      console.log(
        "Klaus — Use Claude Code from any messaging platform\n\n" +
          "Usage: klaus [command]\n\n" +
          "Commands:\n" +
          "  start              Start the bot in background (default)\n" +
          "  start -f           Start in foreground\n" +
          "  stop               Stop the background daemon\n" +
          "  status             Show daemon status\n" +
          "  status --json      Machine-readable status\n" +
          "  logs               Tail daemon logs\n" +
          "  daemon install     Install launchd agent (macOS)\n" +
          "  daemon uninstall   Remove launchd agent\n" +
          "  setup              Interactive setup wizard\n" +
          "  add-channel        Add a channel to existing config\n" +
          "  remove-channel     Remove a channel from config\n" +
          "  doctor             Diagnose environment issues\n",
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
