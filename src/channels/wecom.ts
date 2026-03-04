/**
 * WeChat Work (WeCom) channel: HTTP webhook callback + API replies.
 * Uses Node.js native http and crypto modules.
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createDecipheriv, createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { XMLParser } from "fast-xml-parser";
import { Channel, type Handler } from "./base.js";
import { loadWeComConfig } from "../config.js";
import type { WeComConfig } from "../types.js";
import { chunkTextByBytes } from "../chunk.js";

// WeCom text message API byte limit (content field, UTF-8)
const WECOM_TEXT_BYTE_LIMIT = 2048;

// ---------------------------------------------------------------------------
// Temp file directory for downloaded media
// ---------------------------------------------------------------------------

const TEMP_DIR = join(tmpdir(), "klaus-files");
mkdirSync(TEMP_DIR, { recursive: true });

const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// File download helper (URL-based, for PicUrl etc.)
// ---------------------------------------------------------------------------

async function downloadFile(rawUrl: string, name?: string): Promise<string> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const contentLength = Number(resp.headers.get("content-length") ?? 0);
  if (contentLength > MAX_DOWNLOAD_SIZE) {
    throw new Error(`File too large: ${contentLength} bytes`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.byteLength > MAX_DOWNLOAD_SIZE) {
    throw new Error(`File too large: ${buffer.byteLength} bytes`);
  }

  const fallbackExt = url.match(/\.([\w]+)(?:\?|$)/)?.[1] ?? "bin";
  const safeName = name ? basename(name).replace(/[^\w.\-]/g, "_") : undefined;
  const filename = safeName
    ? `${Date.now()}-${safeName}`
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fallbackExt}`;
  const filepath = join(TEMP_DIR, filename);
  writeFileSync(filepath, buffer);
  return filepath;
}

export class WeComChannel extends Channel {
  private cfg: WeComConfig;
  private aesKey: Buffer;
  private handler: Handler | null = null;
  private accessToken = "";
  private tokenExpiresAt = 0;
  private xmlParser = new XMLParser();

  constructor() {
    super();
    this.cfg = loadWeComConfig();
    this.aesKey = Buffer.from(this.cfg.encodingAesKey + "=", "base64");
  }

  // ------------------------------------------------------------------
  // Channel interface
  // ------------------------------------------------------------------

  async start(handler: Handler): Promise<void> {
    this.handler = handler;

    const server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error("[WeCom] Request error:", err);
        res.writeHead(500);
        res.end("internal error");
      });
    });

    server.listen(this.cfg.port, "0.0.0.0", () => {
      console.log(
        `Klaus WeCom channel listening on :${this.cfg.port}/callback`,
      );
    });

    // Block forever
    await new Promise(() => {});
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${this.cfg.port}`);
    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    if (req.method === "GET") {
      await this.onVerify(url, res);
    } else if (req.method === "POST") {
      const body = await this.readBody(req);
      await this.onMessage(url, body, res);
    } else {
      res.writeHead(405);
      res.end("method not allowed");
    }
  }

  // ------------------------------------------------------------------
  // Callback: URL verification (GET)
  // ------------------------------------------------------------------

  private async onVerify(url: URL, res: ServerResponse): Promise<void> {
    const msgSignature = url.searchParams.get("msg_signature") ?? "";
    const timestamp = url.searchParams.get("timestamp") ?? "";
    const nonce = url.searchParams.get("nonce") ?? "";
    const echostr = url.searchParams.get("echostr") ?? "";

    if (!this.verifySignature(msgSignature, timestamp, nonce, echostr)) {
      res.writeHead(403);
      res.end("signature mismatch");
      return;
    }

    const plaintext = this.decrypt(echostr);
    res.writeHead(200);
    res.end(plaintext);
  }

  // ------------------------------------------------------------------
  // Callback: receive message (POST)
  // ------------------------------------------------------------------

  private async onMessage(
    url: URL,
    body: string,
    res: ServerResponse,
  ): Promise<void> {
    const msgSignature = url.searchParams.get("msg_signature") ?? "";
    const timestamp = url.searchParams.get("timestamp") ?? "";
    const nonce = url.searchParams.get("nonce") ?? "";

    const parsed = this.xmlParser.parse(body);
    const root = parsed.xml;
    const encryptText = root?.Encrypt;
    if (!encryptText) {
      res.writeHead(400);
      res.end("bad request");
      return;
    }

    if (!this.verifySignature(msgSignature, timestamp, nonce, encryptText)) {
      res.writeHead(403);
      res.end("signature mismatch");
      return;
    }

    const xmlText = this.decrypt(encryptText);
    const msg = this.xmlParser.parse(xmlText).xml;

    const msgType = (msg?.MsgType ?? "").toString().trim();
    const fromUser = (msg?.FromUserName ?? "").toString().trim();

    if (!fromUser || msgType === "event") {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    // Respond to WeCom immediately (5-second timeout), process async
    res.writeHead(200);
    res.end("ok");

    this.buildAndHandle(fromUser, msgType, msg);
  }

  private async buildAndHandle(
    fromUser: string,
    msgType: string,
    msg: Record<string, unknown>,
  ): Promise<void> {
    try {
      const prompt = await this.buildPrompt(msgType, msg);
      if (!prompt) return;
      await this.handleAndReply(fromUser, prompt);
    } catch (err) {
      console.error("[WeCom] buildAndHandle error:", err);
    }
  }

  // ------------------------------------------------------------------
  // Build prompt from WeCom XML message
  // ------------------------------------------------------------------

  private async buildPrompt(
    msgType: string,
    msg: Record<string, unknown>,
  ): Promise<string | null> {
    switch (msgType) {
      case "text": {
        const content = (msg.Content ?? "").toString().trim();
        return content || null;
      }

      case "image": {
        const picUrl = (msg.PicUrl ?? "").toString().trim();
        if (!picUrl) return null;
        try {
          const path = await downloadFile(picUrl);
          return `[图片: ${path}，请用 Read 工具查看]`;
        } catch (err) {
          console.error(`[WeCom] Failed to download image: ${err}`);
          return "[图片: 下载失败]";
        }
      }

      case "voice": {
        const recognition = (msg.Recognition ?? "").toString().trim();
        if (recognition) {
          return (
            `[用户发送了一段语音消息，语音识别结果: "${recognition}"]\n` +
            "请基于语音识别的内容回复用户。"
          );
        }
        return (
          "[用户发送了一段语音消息，但你目前无法听取语音。" +
          "请友好地告诉用户：语音消息暂不支持，请将想说的内容打字发送给你。]"
        );
      }

      case "video": {
        return (
          "[用户发送了一段视频，但你目前无法观看视频。" +
          "请友好地告诉用户：视频消息暂不支持，请用文字描述视频内容或截图发送。]"
        );
      }

      case "location": {
        const label = (msg.Label ?? "").toString().trim();
        const lat = parseFloat(String(msg.Location_X ?? ""));
        const lon = parseFloat(String(msg.Location_Y ?? ""));
        const scale = parseInt(String(msg.Scale ?? ""), 10);
        if (isNaN(lat) || isNaN(lon)) return null;
        return (
          "[用户分享了一个位置]\n" +
          `地点: ${label || "未知"}\n` +
          `坐标: ${lat}, ${lon}\n` +
          `缩放: ${isNaN(scale) ? "未知" : scale}`
        );
      }

      case "link": {
        const title = (msg.Title ?? "").toString().trim();
        const description = (msg.Description ?? "").toString().trim();
        const linkUrl = (msg.Url ?? "").toString().trim();
        const parts: string[] = ["[用户分享了一个链接]"];
        if (title) parts.push(`标题: ${title}`);
        if (description) parts.push(`描述: ${description}`);
        if (linkUrl) parts.push(`链接: ${linkUrl}`);
        return parts.join("\n");
      }

      case "file": {
        const mediaId = (msg.MediaId ?? "").toString().trim();
        const fileName = (msg.FileName ?? "").toString().trim();
        if (!mediaId) return null;
        try {
          const ext = fileName.match(/\.(\w+)$/)?.[1];
          const path = await this.downloadMedia(mediaId, ext);
          const displayName = fileName || "未知文件";
          return `[文件: ${path}，文件名: ${displayName}，请用 Read 工具查看]`;
        } catch (err) {
          console.error(`[WeCom] Failed to download file: ${err}`);
          return `[文件 ${fileName || "未知"}: 下载失败]`;
        }
      }

      case "event":
        return null;

      default: {
        console.log(`[WeCom] Unsupported message type: ${msgType}`);
        return null;
      }
    }
  }

  private async handleAndReply(userId: string, content: string): Promise<void> {
    if (!this.handler) return;
    const sessionKey = `wecom:${userId}`;

    let reply: string | null;
    try {
      reply = await this.handler(sessionKey, content);
    } catch (err) {
      reply = `[Error] ${err}`;
    }

    if (reply === null) {
      console.log("[WeCom] Message merged into batch, skipping reply");
      return;
    }

    const chunks = chunkTextByBytes(reply, WECOM_TEXT_BYTE_LIMIT);
    console.log(
      `[WeCom] Replying (${chunks.length} chunk(s)): ${reply.slice(0, 100)}...`,
    );
    for (const chunk of chunks) {
      await this.sendText(userId, chunk);
    }
  }

  // ------------------------------------------------------------------
  // Send message via API
  // ------------------------------------------------------------------

  private async sendText(userId: string, text: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;
    const payload = {
      touser: userId,
      agentid: this.cfg.agentId,
      msgtype: "text",
      text: { content: text },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { errcode?: number };
    if (data.errcode && data.errcode !== 0) {
      console.error(`[WeCom] send failed:`, data);
    }
  }

  // ------------------------------------------------------------------
  // Access token management
  // ------------------------------------------------------------------

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
    url.searchParams.set("corpid", this.cfg.corpId);
    url.searchParams.set("corpsecret", this.cfg.corpSecret);

    const resp = await fetch(url.toString());
    const data = (await resp.json()) as {
      errcode?: number;
      access_token?: string;
      expires_in?: number;
    };

    if (data.errcode && data.errcode !== 0) {
      throw new Error(`Failed to get access_token: ${JSON.stringify(data)}`);
    }

    this.accessToken = data.access_token ?? "";
    // Refresh 5 minutes early
    this.tokenExpiresAt = Date.now() + ((data.expires_in ?? 7200) - 300) * 1000;
    return this.accessToken;
  }

  // ------------------------------------------------------------------
  // Download media from WeCom media/get API
  // ------------------------------------------------------------------

  private async downloadMedia(mediaId: string, ext?: string): Promise<string> {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${token}&media_id=${mediaId}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(
        `WeCom media API HTTP ${resp.status} for media_id=${mediaId}`,
      );
    }

    const contentLength = Number(resp.headers.get("content-length") ?? 0);
    if (contentLength > MAX_DOWNLOAD_SIZE) {
      throw new Error(`File too large: ${contentLength} bytes`);
    }

    // WeCom returns JSON on error, binary on success
    const contentType = resp.headers.get("content-type") ?? "";
    if (
      contentType.includes("application/json") ||
      contentType.includes("text/plain")
    ) {
      const errorData = (await resp.json()) as {
        errcode?: number;
        errmsg?: string;
      };
      throw new Error(
        `WeCom media API error: ${errorData.errmsg ?? "unknown"}`,
      );
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_SIZE) {
      throw new Error(`File too large: ${buffer.byteLength} bytes`);
    }

    // Try to extract filename from Content-Disposition header
    const disposition = resp.headers.get("content-disposition") ?? "";
    const dispositionMatch = disposition.match(/filename="?([^";\s]+)"?/);
    const dispositionName = dispositionMatch?.[1];

    const safeName = dispositionName
      ? basename(dispositionName).replace(/[^\w.\-]/g, "_")
      : undefined;
    const fallbackExt = ext ?? "bin";
    const filename = safeName
      ? `${Date.now()}-${safeName}`
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fallbackExt}`;
    const filepath = join(TEMP_DIR, filename);
    writeFileSync(filepath, buffer);
    return filepath;
  }

  // ------------------------------------------------------------------
  // WeCom message encryption / signature
  // ------------------------------------------------------------------

  private verifySignature(
    signature: string,
    timestamp: string,
    nonce: string,
    encrypt: string,
  ): boolean {
    const parts = [this.cfg.token, timestamp, nonce, encrypt].sort();
    const digest = createHash("sha1").update(parts.join("")).digest("hex");
    return digest === signature;
  }

  private decrypt(encryptText: string): string {
    const iv = this.aesKey.subarray(0, 16);
    const decipher = createDecipheriv("aes-256-cbc", this.aesKey, iv);
    decipher.setAutoPadding(false);
    let raw = Buffer.concat([
      decipher.update(Buffer.from(encryptText, "base64")),
      decipher.final(),
    ]);

    // Remove PKCS#7 padding
    const padLen = raw[raw.length - 1];
    raw = raw.subarray(0, raw.length - padLen);

    // Format: 16 bytes random + 4 bytes msg_len (big endian) + msg + corp_id
    const msgLen = raw.readUInt32BE(16);
    const msg = raw.subarray(20, 20 + msgLen);
    return msg.toString("utf-8");
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private readBody(
    req: IncomingMessage,
    maxBytes = 1 * 1024 * 1024,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      req.on("data", (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > maxBytes) {
          req.destroy();
          reject(new Error("Request body too large"));
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

import { fromLegacyChannel } from "./base.js";

export const wecomPlugin = fromLegacyChannel(
  WeComChannel,
  {
    id: "wecom",
    label: "WeChat Work",
    description: "WeChat Work via HTTP webhook (needs public URL)",
  },
  {
    dm: true,
    image: true,
    file: true,
    requiresPublicUrl: true,
  },
);
