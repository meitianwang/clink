import type { InboundMessage } from "./message.js";

/** Handler signature: receives a structured InboundMessage, returns reply text (null = merged, skip reply). */
export type Handler = (msg: InboundMessage) => Promise<string | null>;

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
  session?: SessionConfig;
}
