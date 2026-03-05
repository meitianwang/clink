import type { InboundMessage } from "./message.js";
import type { ToolEvent } from "./tool-config.js";

/** Callback invoked when Claude uses a tool (optional, used by Web channel). */
export type ToolEventCallback = (event: ToolEvent) => void;

/** Handler signature: receives a structured InboundMessage, returns reply text (null = merged, skip reply). */
export type Handler = (
  msg: InboundMessage,
  onToolEvent?: ToolEventCallback,
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

export interface WebConfig {
  readonly token: string;
  readonly port: number;
  readonly tunnel: boolean;
}

export interface SessionConfig {
  readonly idleMs: number;
  readonly maxEntries: number;
  readonly maxAgeMs: number;
}

export interface KlausConfig {
  channel: string;
  persona?: string;
  qq?: QQBotConfig;
  wecom?: WeComConfig;
  web?: WebConfig;
  session?: SessionConfig;
}
