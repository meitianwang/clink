/**
 * Channel plugin system: composition over inheritance.
 * Inspired by OpenClaw's ChannelPlugin, simplified for Klaus.
 */

import type { Handler } from "../types.js";

// ---------------------------------------------------------------------------
// Capabilities — explicitly declares what a channel supports
// ---------------------------------------------------------------------------

export type ChannelCapabilities = {
  readonly dm?: boolean;
  readonly group?: boolean;
  readonly image?: boolean;
  readonly file?: boolean;
  readonly audio?: boolean;
  readonly video?: boolean;
  readonly reply?: boolean;
  readonly emoji?: boolean;
  readonly mention?: boolean;
  readonly requiresPublicUrl?: boolean;
};

// ---------------------------------------------------------------------------
// Meta — human-readable identity for setup wizard, doctor, etc.
// ---------------------------------------------------------------------------

export type ChannelMeta = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

// ---------------------------------------------------------------------------
// ChannelPlugin — the core contract
// ---------------------------------------------------------------------------

export type ChannelPlugin = {
  readonly meta: ChannelMeta;
  readonly capabilities: ChannelCapabilities;
  /** Start the channel and block forever. */
  readonly start: (handler: Handler) => Promise<void>;
  /**
   * Proactively send a message to a user/target. Optional — not all channels
   * support unsolicited messages.
   * Used by cron scheduler for result delivery.
   */
  readonly deliver?: (to: string, text: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Global registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ChannelPlugin>();

export function registerChannel(plugin: ChannelPlugin): void {
  const id = plugin.meta.id;
  if (registry.has(id)) {
    throw new Error(`Channel "${id}" is already registered`);
  }
  registry.set(id, plugin);
}

export function getChannel(id: string): ChannelPlugin | undefined {
  return registry.get(id);
}

export function listChannels(): ChannelPlugin[] {
  return [...registry.values()];
}

export function listChannelIds(): string[] {
  return [...registry.keys()];
}
