import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";
import type {
  QQBotConfig,
  WeComConfig,
  WebConfig,
  SessionConfig,
  TranscriptsConfig,
  TunnelConfig,
  GoogleOAuthConfig,
  CronConfig,
  CronTask,
  CronDelivery,
  CronRetryConfig,
  CronFailureAlert,
  CronRunLogConfig,
} from "./types.js";

export const CONFIG_DIR = join(homedir(), ".klaus");
export const CONFIG_FILE = join(CONFIG_DIR, "config.yaml");

export function loadConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) return {};
  const content = readFileSync(CONFIG_FILE, "utf-8");
  return (yaml.load(content) as Record<string, unknown>) ?? {};
}

export function saveConfig(data: Record<string, unknown>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, yaml.dump(data, { flowLevel: -1 }), "utf-8");
}

export function getChannelNames(): string[] {
  const cfg = loadConfig();
  const raw = cfg.channel;
  if (Array.isArray(raw)) return raw.map(String);
  return [(raw as string) ?? "qq"];
}

export function loadQQBotConfig(): QQBotConfig {
  const cfg = (loadConfig().qq as Record<string, string>) ?? {};
  return {
    appid: cfg.appid ?? process.env.QQ_BOT_APPID ?? "",
    secret: cfg.secret ?? process.env.QQ_BOT_SECRET ?? "",
  };
}

export function loadWeComConfig(): WeComConfig {
  const cfg = (loadConfig().wecom as Record<string, unknown>) ?? {};
  return {
    corpId: (cfg.corp_id as string) ?? process.env.WECOM_CORP_ID ?? "",
    corpSecret:
      (cfg.corp_secret as string) ?? process.env.WECOM_CORP_SECRET ?? "",
    agentId: Number(cfg.agent_id ?? process.env.WECOM_AGENT_ID ?? 0),
    token: (cfg.token as string) ?? process.env.WECOM_TOKEN ?? "",
    encodingAesKey:
      (cfg.encoding_aes_key as string) ??
      process.env.WECOM_ENCODING_AES_KEY ??
      "",
    port: Number(cfg.port ?? process.env.WECOM_PORT ?? 8080),
  };
}

function parseTunnelConfig(
  raw: unknown,
  envTunnel: string | undefined,
): TunnelConfig | false {
  // boolean true (backward compat) or env "true" → quick tunnel
  if (raw === true || (raw == null && envTunnel === "true")) {
    return { provider: "cloudflare-quick" };
  }

  // boolean false or absent → no tunnel
  if (raw === false || raw == null) {
    return false;
  }

  // object → parse by provider
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const provider = obj.provider as string;

    switch (provider) {
      case "cloudflare-quick":
        return { provider: "cloudflare-quick" };
      case "cloudflare":
        return {
          provider: "cloudflare",
          token: String(obj.token ?? ""),
          ...(obj.hostname ? { hostname: String(obj.hostname) } : {}),
        };
      case "ngrok":
        return {
          provider: "ngrok",
          authtoken: String(obj.authtoken ?? ""),
          ...(obj.domain ? { domain: String(obj.domain) } : {}),
        };
      case "custom":
        return {
          provider: "custom",
          url: String(obj.url ?? ""),
          ...(obj.command ? { command: String(obj.command) } : {}),
        };
      default:
        console.warn(
          `[Web] Unknown tunnel provider "${provider}", using quick tunnel`,
        );
        return { provider: "cloudflare-quick" };
    }
  }

  // Truthy non-object (string "true" etc) → quick tunnel
  if (raw) {
    return { provider: "cloudflare-quick" };
  }

  return false;
}

export function loadWebConfig(): WebConfig {
  const cfg = (loadConfig().web as Record<string, unknown>) ?? {};

  // Google OAuth (optional)
  let google: GoogleOAuthConfig | undefined;
  const googleCfg = cfg.google as Record<string, unknown> | undefined;
  if (googleCfg) {
    const clientId =
      (googleCfg.client_id as string) ??
      process.env.KLAUS_GOOGLE_CLIENT_ID ??
      "";
    const clientSecret =
      (googleCfg.client_secret as string) ??
      process.env.KLAUS_GOOGLE_CLIENT_SECRET ??
      "";
    if (clientId && clientSecret) {
      google = { clientId, clientSecret };
    }
  }

  return {
    port: Number(cfg.port ?? process.env.KLAUS_WEB_PORT ?? 3000),
    tunnel: parseTunnelConfig(cfg.tunnel, process.env.KLAUS_WEB_TUNNEL),
    permissions: Boolean(
      cfg.permissions ?? process.env.KLAUS_WEB_PERMISSIONS === "true",
    ),
    sessionMaxAgeDays: positiveNumber(cfg.session_max_age_days, 7),
    ...(google ? { google } : {}),
  };
}

function positiveNumber(raw: unknown, fallback: number): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadSessionConfig(): SessionConfig {
  const cfg = (loadConfig().session as Record<string, unknown>) ?? {};
  return {
    idleMs: positiveNumber(cfg.idle_minutes, 240) * 60 * 1000,
    maxEntries: Math.floor(positiveNumber(cfg.max_entries, 100)),
    maxAgeMs: positiveNumber(cfg.max_age_days, 7) * 24 * 60 * 60 * 1000,
  };
}

export function loadTranscriptsConfig(): TranscriptsConfig {
  const cfg = (loadConfig().transcripts as Record<string, unknown>) ?? {};
  return {
    transcriptsDir: (cfg.dir as string) ?? join(CONFIG_DIR, "transcripts"),
    maxFiles: Math.floor(positiveNumber(cfg.max_files, 200)),
    maxAgeDays: positiveNumber(cfg.max_age_days, 30),
  };
}

// ---------------------------------------------------------------------------
// Cron config helpers
// ---------------------------------------------------------------------------

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high"]);

function parseFailureAlert(raw: unknown): CronFailureAlert | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.enabled === false) return undefined;
  return {
    enabled: o.enabled !== false,
    after: Math.floor(positiveNumber(o.after, 2)),
    cooldownMs: positiveNumber(o.cooldown_minutes, 60) * 60 * 1000,
    ...(o.channel ? { channel: String(o.channel) } : {}),
    ...(o.to ? { to: String(o.to) } : {}),
  };
}

function parseRetryConfig(raw: unknown): CronRetryConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    maxAttempts: Math.floor(positiveNumber(o.max_attempts, 3)),
    backoffMs: (() => {
      const arr = Array.isArray(o.backoff_ms)
        ? o.backoff_ms.map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : [];
      return arr.length > 0
        ? arr
        : [30_000, 60_000, 300_000, 900_000, 3_600_000];
    })(),
    retryOn: Array.isArray(o.retry_on)
      ? o.retry_on.map(String)
      : ["rate_limit", "network", "server_error"],
  };
}

function parseRunLogConfig(raw: unknown): CronRunLogConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    maxBytes: Math.floor(positiveNumber(o.max_bytes, 2_000_000)),
    keepLines: Math.floor(positiveNumber(o.keep_lines, 2000)),
  };
}

function parseDelivery(raw: unknown): CronDelivery | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  if (!d.channel || typeof d.channel !== "string") return undefined;
  const mode = d.mode as string | undefined;
  return {
    channel: d.channel,
    ...(d.to ? { to: String(d.to) } : {}),
    ...(mode === "announce" || mode === "webhook" || mode === "none"
      ? { mode }
      : {}),
  };
}

export function loadCronConfig(): CronConfig {
  const cfg = (loadConfig().cron as Record<string, unknown>) ?? {};
  const enabled = cfg.enabled === true;
  const rawTasks = Array.isArray(cfg.tasks) ? cfg.tasks : [];

  const tasks: CronTask[] = rawTasks
    .filter(
      (t: unknown): t is Record<string, unknown> =>
        typeof t === "object" && t !== null,
    )
    .map((t) => {
      const thinking = String(t.thinking ?? "");
      return {
        id: String(t.id ?? ""),
        name: t.name != null ? String(t.name) : undefined,
        schedule: String(t.schedule ?? ""),
        prompt: String(t.prompt ?? ""),
        model: t.model != null ? String(t.model) : undefined,
        enabled: t.enabled !== false,
        // New fields
        fallbacks: Array.isArray(t.fallbacks)
          ? t.fallbacks.map(String)
          : undefined,
        thinking: THINKING_LEVELS.has(thinking)
          ? (thinking as CronTask["thinking"])
          : undefined,
        lightContext: t.light_context === true ? true : undefined,
        deleteAfterRun:
          t.delete_after_run != null ? t.delete_after_run === true : undefined,
        staggerMs:
          t.stagger_ms != null ? Math.floor(Number(t.stagger_ms)) : undefined,
        deliver: parseDelivery(t.deliver),
        webhookUrl: t.webhook_url != null ? String(t.webhook_url) : undefined,
        webhookToken:
          t.webhook_token != null ? String(t.webhook_token) : undefined,
        failureAlert:
          t.failure_alert === false
            ? (false as const)
            : parseFailureAlert(t.failure_alert),
      };
    })
    .filter((t) => t.id && t.schedule && t.prompt);

  return {
    enabled,
    tasks,
    webhookToken:
      cfg.webhook_token != null ? String(cfg.webhook_token) : undefined,
    retry: parseRetryConfig(cfg.retry),
    sessionRetentionMs:
      cfg.session_retention_minutes != null
        ? positiveNumber(cfg.session_retention_minutes, 1440) * 60 * 1000
        : undefined,
    runLog: parseRunLogConfig(cfg.run_log),
    failureAlert: parseFailureAlert(cfg.failure_alert),
  };
}
