/**
 * QQ Bot channel: WebSocket connection via qq-group-bot SDK.
 * Auto-installs qq-group-bot if missing.
 * Supports rich media: images, files, video, audio, emoji, replies, mentions.
 */

import { execSync } from "node:child_process";
import { Channel, type Handler } from "./base.js";
import { loadQQBotConfig } from "../config.js";
import { chunkText } from "../chunk.js";
import {
  retryAsync,
  computeBackoff,
  sleep,
  DEFAULT_RECONNECT,
  type ReconnectConfig,
} from "../retry.js";
import {
  type InboundMessage,
  type MediaFile,
  downloadFile,
} from "../message.js";

// QQ Bot text message character limit (conservative, platform may allow more)
const QQ_TEXT_LIMIT = 4000;

// ---------------------------------------------------------------------------
// Types for qq-group-bot message elements
// ---------------------------------------------------------------------------

interface MsgElem {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Message cache for reply lookups (QQ Bot API v2 has no "get message by ID")
// ---------------------------------------------------------------------------

const MSG_CACHE = new Map<string, string>();
const MSG_CACHE_MAX = 200;

function cacheMessage(msgId: string, text: string): void {
  if (!msgId) return;
  if (MSG_CACHE.size >= MSG_CACHE_MAX) {
    const oldest = MSG_CACHE.keys().next().value!;
    MSG_CACHE.delete(oldest);
  }
  MSG_CACHE.set(msgId, text);
}

function getCachedMessage(msgId: string): string | undefined {
  return MSG_CACHE.get(msgId);
}

// ---------------------------------------------------------------------------
// Build InboundMessage from QQ message elements
// ---------------------------------------------------------------------------

async function buildInboundMessage(
  elements: MsgElem[],
  sessionKey: string,
  chatType: "private" | "group",
  senderId: string,
): Promise<InboundMessage> {
  const textParts: string[] = [];
  const media: MediaFile[] = [];
  const mentions: string[] = [];
  let replyText: string | undefined;
  let replyMessageId: string | undefined;
  let hasReply = false;

  for (const elem of elements) {
    switch (elem.type) {
      case "text": {
        const text = (elem.text as string)?.trim();
        if (text) textParts.push(text);
        break;
      }

      case "image": {
        const url = elem.url as string | undefined;
        if (!url) break;
        try {
          const path = await downloadFile(url, elem.name as string | undefined);
          media.push({ type: "image", path, url });
        } catch (err) {
          console.error(`[QQ] Failed to download image: ${err}`);
          media.push({ type: "image", url });
        }
        break;
      }

      case "video": {
        media.push({ type: "video" });
        break;
      }

      case "audio": {
        media.push({ type: "audio" });
        break;
      }

      case "face": {
        const text = elem.text as string | undefined;
        const id = elem.id as number | undefined;
        const label = text || (id !== undefined ? String(id) : null);
        if (label) textParts.push(`[表情:${label}]`);
        break;
      }

      case "markdown": {
        const content = (elem.content as string)?.trim();
        if (content) textParts.push(content);
        break;
      }

      case "at": {
        const uid = elem.user_id as string;
        mentions.push(uid === "all" ? "all" : uid);
        break;
      }

      case "reply": {
        const refId = (elem.id ?? elem.message_id) as string | undefined;
        hasReply = true;
        if (refId) {
          replyMessageId = refId;
          const cached = getCachedMessage(refId);
          if (cached) {
            replyText = cached;
          }
        }
        break;
      }

      default: {
        // Generic handler for other types with downloadable URL (e.g. PDF)
        const url = elem.url as string | undefined;
        if (url) {
          try {
            const path = await downloadFile(
              url,
              elem.name as string | undefined,
            );
            media.push({
              type: "file",
              path,
              url,
              fileName: (elem.name as string) ?? undefined,
            });
          } catch {
            const name = (elem.name as string) ?? elem.type;
            media.push({ type: "file", fileName: name });
          }
        }
        break;
      }
    }
  }

  // Determine message type
  const hasText = textParts.length > 0;
  const hasMedia = media.length > 0;
  let messageType: InboundMessage["messageType"];
  if (hasText && hasMedia) {
    messageType = "mixed";
  } else if (hasMedia) {
    const first = media[0];
    messageType =
      first.type === "image"
        ? "image"
        : first.type === "audio"
          ? "voice"
          : first.type === "video"
            ? "video"
            : "file";
  } else {
    messageType = "text";
  }

  return {
    sessionKey,
    text: textParts.join("\n").trim(),
    messageType,
    chatType,
    senderId,
    ...(media.length > 0 ? { media } : {}),
    ...(mentions.length > 0 ? { mentions } : {}),
    ...(hasReply
      ? {
          replyTo: {
            messageId: replyMessageId,
            text: replyText,
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// QQ Channel
// ---------------------------------------------------------------------------

type BotConstructor = new (
  config: Record<string, unknown>,
) => Record<string, Function>;

// Reconnect config for QQ WebSocket lifecycle
const QQ_RECONNECT: ReconnectConfig = {
  ...DEFAULT_RECONNECT,
  initialMs: 3_000,
  maxMs: 120_000,
};

export class QQChannel extends Channel {
  private cfg = loadQQBotConfig();

  async start(handler: Handler): Promise<void> {
    console.log("Klaus QQ Bot channel starting...");

    const BotClass = await this.loadBotClass();
    let reconnectAttempts = 0;

    // Outer reconnection loop — restarts the entire bot on fatal disconnect
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.runBot(BotClass, handler, () => {
          reconnectAttempts = 0;
        });
      } catch (err) {
        reconnectAttempts += 1;
        const delay = computeBackoff(QQ_RECONNECT, reconnectAttempts);
        console.error(
          `[QQ] Bot disconnected (attempt ${reconnectAttempts}), reconnecting in ${delay}ms…`,
          err,
        );
        await sleep(delay);
      }
    }
  }

  // ------------------------------------------------------------------
  // Load qq-group-bot SDK (auto-install if missing)
  // ------------------------------------------------------------------

  private async loadBotClass(): Promise<BotConstructor> {
    type Mod = { Bot?: BotConstructor; QQBot?: BotConstructor };
    try {
      const mod: Mod = await import("qq-group-bot");
      return (mod.Bot ?? mod.QQBot)!;
    } catch {
      console.log("[QQ] qq-group-bot not found, installing...");
      try {
        execSync("npm install -g qq-group-bot", { stdio: "inherit" });
        const mod: Mod = await import("qq-group-bot");
        return (mod.Bot ?? mod.QQBot)!;
      } catch {
        console.error(
          "[QQ] Failed to install qq-group-bot.\n" +
            "Install manually: npm install -g qq-group-bot",
        );
        process.exit(1);
      }
    }
  }

  // ------------------------------------------------------------------
  // Run bot — resolves/throws when the connection drops
  // ------------------------------------------------------------------

  private async runBot(
    BotClass: BotConstructor,
    handler: Handler,
    onConnected: () => void,
  ): Promise<void> {
    const bot = new BotClass({
      appid: this.cfg.appid,
      secret: this.cfg.secret,
      intents: ["C2C_MESSAGE_CREATE", "GROUP_AT_MESSAGE_CREATE"],
      sandbox: true,
      removeAt: true,
      logLevel: "info",
      maxRetry: 10,
    }) as Record<string, Function>;

    await (bot.start as () => Promise<void>)();
    console.log("Klaus QQ Bot online");
    onConnected();

    // Private messages (C2C)
    bot.on("message.private", async (e: Record<string, unknown>) => {
      const userId = (e.user_openid ??
        e.user_id ??
        e.sender?.toString()) as string;
      if (!userId) return;

      const elements = e.message as MsgElem[] | undefined;
      const sessionKey = `c2c:${userId}`;

      let msg: InboundMessage;
      if (elements?.length) {
        msg = await buildInboundMessage(
          elements,
          sessionKey,
          "private",
          userId,
        );
      } else {
        const text = (
          (e.content as string) ??
          (e.raw_message as string) ??
          ""
        ).trim();
        if (!text) return;
        msg = {
          sessionKey,
          text,
          messageType: "text",
          chatType: "private",
          senderId: userId,
        };
      }

      if (!msg.text && !msg.media?.length) return;

      const msgId = (e.message_id ?? e.id) as string;
      if (msgId) cacheMessage(msgId, msg.text || `[${msg.messageType}]`);

      const preview = msg.text || `[${msg.messageType}]`;
      console.log(`[C2C] Received (${sessionKey}): ${preview.slice(0, 120)}`);

      try {
        const reply = await handler(msg);
        if (reply === null) {
          console.log("[C2C] Message merged into batch, skipping reply");
          return;
        }

        await this.sendReply(e, msgId, reply, "C2C");
      } catch (err) {
        console.error(`[C2C] Error: ${err}`);
      }
    });

    // Group messages (@bot)
    bot.on("message.group", async (e: Record<string, unknown>) => {
      const groupId = (e.group_openid ?? e.group_id) as string;
      if (!groupId) return;

      const userId = (e.user_openid ??
        e.user_id ??
        e.sender?.toString()) as string;

      const elements = e.message as MsgElem[] | undefined;
      const sessionKey = `group:${groupId}`;

      let msg: InboundMessage;
      if (elements?.length) {
        msg = await buildInboundMessage(
          elements,
          sessionKey,
          "group",
          userId || groupId,
        );
      } else {
        const text = (
          (e.content as string) ??
          (e.raw_message as string) ??
          ""
        ).trim();
        if (!text) return;
        msg = {
          sessionKey,
          text,
          messageType: "text",
          chatType: "group",
          senderId: userId || groupId,
        };
      }

      if (!msg.text && !msg.media?.length) return;

      const msgId = (e.message_id ?? e.id) as string;
      if (msgId) cacheMessage(msgId, msg.text || `[${msg.messageType}]`);

      const preview = msg.text || `[${msg.messageType}]`;
      console.log(
        `[Group] Received (${sessionKey}): ${preview.slice(0, 120)}`,
      );

      try {
        const reply = await handler(msg);
        if (reply === null) {
          console.log("[Group] Message merged into batch, skipping reply");
          return;
        }

        await this.sendReply(e, msgId, reply, "Group");
      } catch (err) {
        console.error(`[Group] Error: ${err}`);
      }
    });

    // Wait for disconnect — the SDK emits "close" or the promise rejects
    await new Promise<void>((_, reject) => {
      if (typeof bot.on === "function") {
        bot.on("close", () => reject(new Error("WebSocket closed")));
        bot.on("error", (err: unknown) => reject(err));
      }
    });
  }

  // ------------------------------------------------------------------
  // Send reply with retry
  // ------------------------------------------------------------------

  private async sendReply(
    e: Record<string, unknown>,
    msgId: string,
    reply: string,
    tag: string,
  ): Promise<void> {
    const chunks = chunkText(reply, QQ_TEXT_LIMIT);
    console.log(
      `[${tag}] Replying (${chunks.length} chunk(s)): ${reply.slice(0, 100)}...`,
    );

    const replyFn = e.reply as (msg: unknown) => Promise<void>;
    for (let i = 0; i < chunks.length; i++) {
      const msg =
        i === 0 && msgId
          ? [{ type: "reply", id: msgId }, chunks[i]]
          : chunks[i];
      await retryAsync(() => replyFn(msg), { attempts: 3 }, `qq-reply-${tag}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

import { fromLegacyChannel } from "./base.js";

export const qqPlugin = fromLegacyChannel(
  QQChannel,
  {
    id: "qq",
    label: "QQ Bot",
    description: "QQ Bot via WebSocket (no public IP needed)",
  },
  {
    dm: true,
    group: true,
    image: true,
    file: true,
    reply: true,
    emoji: true,
    mention: true,
  },
);
