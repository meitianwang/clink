import type { InboundMessage } from "./message.js";
import type { ToolEvent } from "./tool-config.js";

/** Callback invoked when Claude uses a tool (optional, used by Web channel). */
export type ToolEventCallback = (event: ToolEvent) => void;

/** Callback for streaming text chunks (optional, used by Web channel). */
export type StreamChunkCallback = (chunk: string) => void;

/** A permission request sent to the browser for user approval. */
export interface PermissionRequest {
  readonly requestId: string;
  readonly toolName: string;
  readonly toolUseId: string;
  readonly input: Record<string, unknown>;
  readonly description?: string;
  readonly display: {
    readonly icon: string;
    readonly label: string;
    readonly style: string;
    readonly value: string;
    readonly secondary?: string;
  };
}

/** Callback for interactive tool permission approval (optional, used by Web channel). */
export type PermissionRequestCallback = (
  request: PermissionRequest,
) => Promise<{ allow: boolean }>;

/** Handler signature: receives a structured InboundMessage, returns reply text (null = merged, skip reply). */
export type Handler = (
  msg: InboundMessage,
  onToolEvent?: ToolEventCallback,
  onStreamChunk?: StreamChunkCallback,
  onPermissionRequest?: PermissionRequestCallback,
) => Promise<string | null>;

export interface QQBotConfig {
  readonly appid: string;
  readonly secret: string;
}

export interface WeComConfig {
  readonly corpId: string;
  readonly corpSecret: string;
  readonly agentId: number;
  readonly token: string;
  readonly encodingAesKey: string;
  readonly port: number;
}

// ---------------------------------------------------------------------------
// Tunnel provider configs (discriminated union)
// ---------------------------------------------------------------------------

export interface QuickTunnelConfig {
  readonly provider: "cloudflare-quick";
}

export interface NamedTunnelConfig {
  readonly provider: "cloudflare";
  readonly token: string;
  readonly hostname?: string;
}

export interface NgrokTunnelConfig {
  readonly provider: "ngrok";
  readonly authtoken: string;
  readonly domain?: string;
}

export interface CustomTunnelConfig {
  readonly provider: "custom";
  readonly url: string;
  readonly command?: string;
}

export type TunnelConfig =
  | QuickTunnelConfig
  | NamedTunnelConfig
  | NgrokTunnelConfig
  | CustomTunnelConfig;

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface WebConfig {
  readonly port: number;
  readonly tunnel: TunnelConfig | false;
  readonly permissions: boolean;
  readonly sessionMaxAgeDays: number;
  readonly google?: GoogleOAuthConfig;
}

export interface SessionConfig {
  readonly idleMs: number;
  readonly maxEntries: number;
  readonly maxAgeMs: number;
}

export interface TranscriptsConfig {
  readonly transcriptsDir: string;
  readonly maxFiles: number;
  readonly maxAgeDays: number;
}

// ---------------------------------------------------------------------------
// Cron (scheduled tasks)
// ---------------------------------------------------------------------------

export type CronScheduleType =
  | { readonly kind: "cron"; readonly expr: string; readonly tz?: string }
  | { readonly kind: "every"; readonly intervalMs: number }
  | { readonly kind: "at"; readonly at: string };

export interface CronDelivery {
  readonly channel: string;
  readonly to?: string;
  readonly mode?: "announce" | "webhook" | "none";
}

export interface CronRetryConfig {
  readonly maxAttempts: number;
  readonly backoffMs: readonly number[];
  readonly retryOn: readonly string[];
}

export interface CronFailureAlert {
  readonly enabled: boolean;
  readonly after: number;
  readonly cooldownMs: number;
  readonly channel?: string;
  readonly to?: string;
}

export interface CronRunLogConfig {
  readonly maxBytes: number;
  readonly keepLines: number;
}

export interface CronTask {
  readonly id: string;
  readonly name?: string;
  readonly schedule: string | CronScheduleType;
  readonly prompt: string;
  readonly model?: string;
  readonly fallbacks?: readonly string[];
  readonly thinking?: "off" | "minimal" | "low" | "medium" | "high";
  readonly lightContext?: boolean;
  readonly enabled?: boolean;
  readonly deleteAfterRun?: boolean;
  readonly staggerMs?: number;
  readonly deliver?: CronDelivery;
  readonly webhookUrl?: string;
  readonly webhookToken?: string;
  readonly failureAlert?: CronFailureAlert | false;
}

export interface CronConfig {
  readonly enabled: boolean;
  readonly tasks: readonly CronTask[];
  readonly webhookToken?: string;
  readonly retry?: CronRetryConfig;
  readonly sessionRetentionMs?: number;
  readonly runLog?: CronRunLogConfig;
  readonly failureAlert?: CronFailureAlert;
}

export interface KlausConfig {
  channel: string;
  persona?: string;
  qq?: QQBotConfig;
  wecom?: WeComConfig;
  web?: WebConfig;
  session?: SessionConfig;
  transcripts?: TranscriptsConfig;
  cron?: CronConfig;
}
