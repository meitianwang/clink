import { existsSync } from "node:fs";
import { qqPlugin } from "./channels/qq.js";
import { wecomPlugin } from "./channels/wecom.js";
import { webPlugin } from "./channels/web.js";
import { registerChannel, getChannel } from "./channels/types.js";
import { getChannelName, CONFIG_FILE, loadSessionConfig } from "./config.js";
import { ensureConfigValid } from "./config-validate.js";
import { ChatSessionManager } from "./core.js";
import { t } from "./i18n.js";
import { type InboundMessage, formatPrompt } from "./message.js";
import type { ToolEventCallback, StreamChunkCallback } from "./types.js";

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

  const channelName = getChannelName();
  const plugin = getChannel(channelName);
  if (!plugin) {
    console.error(`Internal error: channel "${channelName}" not registered.`);
    process.exit(1);
  }

  // Initialize session persistence
  const sessionCfg = loadSessionConfig();
  const { SessionStore } = await import("./session-store.js");
  const store = new SessionStore();
  await store.load();
  store.pruneStale(sessionCfg.maxAgeMs);
  store.capEntries(sessionCfg.maxEntries);
  await store.save();

  const sessions = new ChatSessionManager(store, sessionCfg.idleMs);

  const handler = async (
    msg: InboundMessage,
    onToolEvent?: ToolEventCallback,
    onStreamChunk?: StreamChunkCallback,
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
    return sessions.chat(msg.sessionKey, prompt, onToolEvent, onStreamChunk);
  };

  try {
    await plugin.start(handler);
  } finally {
    await sessions.close();
  }
}

function main(): void {
  const cmd = process.argv[2] ?? "start";

  switch (cmd) {
    case "setup":
      import("./setup-wizard.js").then((m) => m.runSetup());
      break;
    case "doctor":
      import("./doctor.js").then((m) => m.runDoctor());
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
