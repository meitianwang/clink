/**
 * QQ Bot channel: WebSocket connection via qq-group-bot SDK.
 * Auto-installs qq-group-bot if missing.
 * Supports rich media: images, files, video, audio, emoji, replies, mentions.
 */

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { Channel, type Handler } from "./base.js";
import { loadQQBotConfig } from "../config.js";
import { chunkText } from "../chunk.js";

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
// Temp file directory for downloaded media
// ---------------------------------------------------------------------------

const TEMP_DIR = join(tmpdir(), "klaus-files");
mkdirSync(TEMP_DIR, { recursive: true });

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
// File download helper
// ---------------------------------------------------------------------------

const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

async function downloadFile(rawUrl: string, name?: string): Promise<string> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const contentLength = Number(resp.headers.get("content-length") ?? 0);
  if (contentLength > MAX_DOWNLOAD_SIZE) {
    throw new Error(`File too large: ${contentLength} bytes`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());

  const fallbackExt = url.match(/\.([\w]+)(?:\?|$)/)?.[1] ?? "bin";
  // Sanitize name: strip path components, add timestamp prefix to avoid collision
  const safeName = name ? basename(name).replace(/[^\w.\-]/g, "_") : undefined;
  const filename = safeName
    ? `${Date.now()}-${safeName}`
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fallbackExt}`;
  const filepath = join(TEMP_DIR, filename);
  writeFileSync(filepath, buffer);
  return filepath;
}

// ---------------------------------------------------------------------------
// Build prompt from message elements
// ---------------------------------------------------------------------------

async function buildPrompt(elements: MsgElem[]): Promise<string> {
  const parts: string[] = [];

  for (const elem of elements) {
    switch (elem.type) {
      case "text": {
        const text = (elem.text as string)?.trim();
        if (text) parts.push(text);
        break;
      }

      case "image": {
        const url = elem.url as string | undefined;
        if (!url) break;
        try {
          const path = await downloadFile(url, elem.name as string | undefined);
          parts.push(`[图片: ${path}，请用 Read 工具查看]`);
        } catch (err) {
          console.error(`[QQ] Failed to download image: ${err}`);
          parts.push("[图片: 下载失败]");
        }
        break;
      }

      case "video": {
        parts.push(
          "[用户发送了一段视频，但你目前无法观看视频。" +
            "请友好地告诉用户：视频消息暂不支持，请用文字描述视频内容或截图发送。]",
        );
        break;
      }

      case "audio": {
        parts.push(
          "[用户发送了一段语音消息，但你目前无法听取语音。" +
            "请友好地告诉用户：语音消息暂不支持，请将想说的内容打字发送给你。]",
        );
        break;
      }

      case "face": {
        const text = elem.text as string | undefined;
        const id = elem.id as number | undefined;
        parts.push(text ? `[表情:${text}]` : `[表情:${id}]`);
        break;
      }

      case "markdown": {
        const content = (elem.content as string)?.trim();
        if (content) parts.push(content);
        break;
      }

      case "at": {
        const uid = elem.user_id as string;
        parts.push(uid === "all" ? "[@全体成员]" : `[@用户:${uid}]`);
        break;
      }

      case "reply": {
        const refId = (elem.id ?? elem.message_id) as string | undefined;
        if (refId) {
          const cached = getCachedMessage(refId);
          if (cached) {
            const preview =
              cached.length > 200 ? cached.slice(0, 200) + "..." : cached;
            parts.push(`[回复消息: "${preview}"]`);
          } else {
            parts.push("[回复了一条消息]");
          }
        }
        break;
      }

      default: {
        // Generic handler for other types with downloadable URL (e.g. application/pdf)
        const url = elem.url as string | undefined;
        if (url) {
          try {
            const path = await downloadFile(
              url,
              elem.name as string | undefined,
            );
            parts.push(`[文件: ${path}，请用 Read 工具查看]`);
          } catch {
            const name = (elem.name as string) ?? elem.type;
            parts.push(`[文件 ${name}: 下载失败]`);
          }
        }
        break;
      }
    }
  }

  return parts.join("\n").trim();
}

// ---------------------------------------------------------------------------
// QQ Channel
// ---------------------------------------------------------------------------

export class QQChannel extends Channel {
  private cfg = loadQQBotConfig();

  async start(handler: Handler): Promise<void> {
    console.log("Klaus QQ Bot channel starting...");

    let BotClass: new (
      config: Record<string, unknown>,
    ) => Record<string, unknown>;
    try {
      const mod = await import("qq-group-bot");
      BotClass = (mod.Bot ?? mod.QQBot) as typeof BotClass;
    } catch {
      console.log("[QQ] qq-group-bot not found, installing...");
      try {
        execSync("npm install -g qq-group-bot", { stdio: "inherit" });
        const mod = await import("qq-group-bot");
        BotClass = (mod.Bot ?? mod.QQBot) as typeof BotClass;
      } catch {
        console.error(
          "[QQ] Failed to install qq-group-bot.\n" +
            "Install manually: npm install -g qq-group-bot",
        );
        process.exit(1);
      }
    }

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

    // Private messages (C2C)
    bot.on("message.private", async (e: Record<string, unknown>) => {
      const userId = (e.user_openid ??
        e.user_id ??
        e.sender?.toString()) as string;
      if (!userId) return;

      const elements = e.message as MsgElem[] | undefined;
      const prompt = elements?.length
        ? await buildPrompt(elements)
        : ((e.content as string) ?? (e.raw_message as string) ?? "").trim();
      if (!prompt) return;

      const msgId = (e.message_id ?? e.id) as string;
      if (msgId) cacheMessage(msgId, prompt);

      const sessionKey = `c2c:${userId}`;
      console.log(`[C2C] Received (${sessionKey}): ${prompt.slice(0, 120)}`);

      try {
        const reply = await handler(sessionKey, prompt);
        if (reply === null) {
          console.log("[C2C] Message merged into batch, skipping reply");
          return;
        }

        const chunks = chunkText(reply, QQ_TEXT_LIMIT);
        console.log(
          `[C2C] Replying (${chunks.length} chunk(s)): ${reply.slice(0, 100)}...`,
        );

        const replyFn = e.reply as (msg: unknown) => Promise<void>;
        for (let i = 0; i < chunks.length; i++) {
          const msg =
            i === 0 && msgId
              ? [{ type: "reply", id: msgId }, chunks[i]]
              : chunks[i];
          await replyFn(msg);
        }
      } catch (err) {
        console.error(`[C2C] Error: ${err}`);
      }
    });

    // Group messages (@bot)
    bot.on("message.group", async (e: Record<string, unknown>) => {
      const groupId = (e.group_openid ?? e.group_id) as string;
      if (!groupId) return;

      const elements = e.message as MsgElem[] | undefined;
      const prompt = elements?.length
        ? await buildPrompt(elements)
        : ((e.content as string) ?? (e.raw_message as string) ?? "").trim();
      if (!prompt) return;

      const msgId = (e.message_id ?? e.id) as string;
      if (msgId) cacheMessage(msgId, prompt);

      const sessionKey = `group:${groupId}`;
      console.log(`[Group] Received (${sessionKey}): ${prompt.slice(0, 120)}`);

      try {
        const reply = await handler(sessionKey, prompt);
        if (reply === null) {
          console.log("[Group] Message merged into batch, skipping reply");
          return;
        }

        const chunks = chunkText(reply, QQ_TEXT_LIMIT);
        console.log(
          `[Group] Replying (${chunks.length} chunk(s)): ${reply.slice(0, 100)}...`,
        );

        const replyFn = e.reply as (msg: unknown) => Promise<void>;
        for (let i = 0; i < chunks.length; i++) {
          const msg =
            i === 0 && msgId
              ? [{ type: "reply", id: msgId }, chunks[i]]
              : chunks[i];
          await replyFn(msg);
        }
      } catch (err) {
        console.error(`[Group] Error: ${err}`);
      }
    });

    // Block forever
    await new Promise(() => {});
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
