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

export interface FrpTunnelConfig {
  readonly provider: "frp";
  readonly server_addr: string;
  readonly server_port: number;
  readonly token: string;
  readonly proxy_type?: "http" | "tcp";
  readonly custom_domains?: readonly string[];
  readonly remote_port?: number;
  readonly proxy_name?: string;
  readonly tls_enable?: boolean;
  /** Transport protocol: "tcp" (default) or "websocket" (for CF CDN relay). */
  readonly transport_protocol?: "tcp" | "websocket";
}

export type TunnelConfig =
  | QuickTunnelConfig
  | NamedTunnelConfig
  | NgrokTunnelConfig
  | CustomTunnelConfig
  | FrpTunnelConfig;

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

// ---------------------------------------------------------------------------
// Claude model configuration
// ---------------------------------------------------------------------------

export interface ClaudeModelConfig {
  readonly mode: "official" | "thirdparty";
  /** Default model tier: "opus", "sonnet", or "haiku". */
  readonly model: string;
  /** Third-party API base URL (required when mode=thirdparty). */
  readonly baseUrl?: string;
  /** Third-party auth token (required when mode=thirdparty). */
  readonly authToken?: string;
  /** Model name mapping for each tier (thirdparty only). */
  readonly modelMap?: {
    readonly haiku?: string;
    readonly opus?: string;
    readonly sonnet?: string;
  };
  /** API timeout in ms (thirdparty only). */
  readonly apiTimeoutMs?: number;
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

export interface CronFailureDestination {
  readonly channel?: string;
  readonly to?: string;
  readonly accountId?: string;
  readonly mode?: "announce" | "webhook";
}

export interface CronDelivery {
  readonly channel: string;
  readonly to?: string;
  readonly mode?: "announce" | "webhook" | "none";
  /** Skip delivery failures instead of failing the task. */
  readonly bestEffort?: boolean;
  /** Multi-account: target a specific channel account. */
  readonly accountId?: string;
  /** Separate destination for failure notifications. */
  readonly failureDestination?: CronFailureDestination;
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
  /** Delivery mode: announce to channel, POST to webhook, or both. */
  readonly mode?: "announce" | "webhook";
  /** Webhook URL for failure alert delivery. */
  readonly webhookUrl?: string;
  /** Bearer token for failure alert webhook. */
  readonly webhookToken?: string;
}

export interface CronRunLogConfig {
  readonly maxBytes: number;
  readonly keepLines: number;
}

export interface CronTask {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly schedule: string | CronScheduleType;
  readonly prompt: string;
  readonly fallbacks?: readonly string[];
  readonly thinking?: "off" | "minimal" | "low" | "medium" | "high";
  readonly lightContext?: boolean;
  readonly enabled?: boolean;
  readonly deleteAfterRun?: boolean;
  /** Task execution timeout in seconds. 0 = disable. Default: 600 (10 min). */
  readonly timeoutSeconds?: number;
  readonly staggerMs?: number;
  readonly deliver?: CronDelivery;
  readonly webhookUrl?: string;
  readonly webhookToken?: string;
  readonly failureAlert?: CronFailureAlert | false;
  /** Timestamp when task was created (epoch ms). */
  readonly createdAt?: number;
  /** Timestamp when task was last updated (epoch ms). */
  readonly updatedAt?: number;
}

export interface CronConfig {
  readonly enabled: boolean;
  readonly tasks: readonly CronTask[];
  readonly webhookToken?: string;
  readonly retry?: CronRetryConfig;
  readonly sessionRetentionMs?: number;
  readonly runLog?: CronRunLogConfig;
  readonly failureAlert?: CronFailureAlert;
  /** Max concurrent cron task executions. Default: unlimited. */
  readonly maxConcurrentRuns?: number;
  /** Separate destination for failure notifications (global default). */
  readonly failureDestination?: CronFailureDestination;
  /** Path to persistent job store file. Default: ~/.klaus/cron/jobs.json */
  readonly storePath?: string;
}

// ---------------------------------------------------------------------------
// Cron runtime types (used by CronScheduler + CLI)
// ---------------------------------------------------------------------------

export interface CronRunRecord {
  readonly taskId: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly status: "ok" | "error" | "skipped";
  readonly resultPreview?: string;
  readonly error?: string;
}

export interface CronTaskStatus {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly schedule: string;
  readonly enabled: boolean;
  readonly nextRun: string | null;
  readonly lastRun: CronRunRecord | null;
  readonly consecutiveErrors: number;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

export interface CronSchedulerStatus {
  readonly running: boolean;
  readonly taskCount: number;
  readonly activeJobs: number;
  readonly runningTasks: number;
  readonly maxConcurrentRuns: number | null;
  readonly nextWakeAt: string | null;
}

