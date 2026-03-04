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
import { writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { Channel, type Handler } from "./base.js";
import { loadWeComConfig } from "../config.js";
import type { WeComConfig } from "../types.js";
import { chunkTextByBytes } from "../chunk.js";
import { retryAsync } from "../retry.js";
import {
  type InboundMessage,
  downloadFile,
  TEMP_DIR,
  MAX_DOWNLOAD_SIZE,
} from "../message.js";

// WeCom text message API byte limit (content field, UTF-8)
const WECOM_TEXT_BYTE_LIMIT = 2048;

// Retryable WeCom error codes: token expired, rate limited, system busy
const RETRYABLE_ERRCODES = new Set([42001, 45009, -1]);

class WeComApiError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly errcode: number,
    errmsg: string,
  ) {
    super(`WeCom API ${errcode}: ${errmsg}`);
    this.retryable = RETRYABLE_ERRCODES.has(errcode);
  }
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
      const inbound = await this.buildInboundMessage(msgType, msg, fromUser);
      if (!inbound) return;
      await this.handleAndReply(inbound);
    } catch (err) {
      console.error("[WeCom] buildAndHandle error:", err);
    }
  }

  // ------------------------------------------------------------------
  // Build InboundMessage from WeCom XML message
  // ------------------------------------------------------------------

  private async buildInboundMessage(
    msgType: string,
    msg: Record<string, unknown>,
    userId: string,
  ): Promise<InboundMessage | null> {
    const sessionKey = `wecom:${userId}`;
    const base = {
      sessionKey,
      chatType: "private" as const,
      senderId: userId,
    };

    switch (msgType) {
      case "text": {
        const content = (msg.Content ?? "").toString().trim();
        if (!content) return null;
        return { ...base, text: content, messageType: "text" };
      }

      case "image": {
        const picUrl = (msg.PicUrl ?? "").toString().trim();
        if (!picUrl) return null;
        try {
          const path = await downloadFile(picUrl);
          return {
            ...base,
            text: "",
            messageType: "image",
            media: [{ type: "image", path, url: picUrl }],
          };
        } catch (err) {
          console.error(`[WeCom] Failed to download image: ${err}`);
          return {
            ...base,
            text: "",
            messageType: "image",
            media: [{ type: "image", url: picUrl }],
          };
        }
      }

      case "voice": {
        const recognition = (msg.Recognition ?? "").toString().trim();
        return {
          ...base,
          text: "",
          messageType: "voice",
          media: [
            {
              type: "audio",
              ...(recognition ? { transcription: recognition } : {}),
            },
          ],
        };
      }

      case "video": {
        return {
          ...base,
          text: "",
          messageType: "video",
          media: [{ type: "video" }],
        };
      }

      case "location": {
        const lat = parseFloat(String(msg.Location_X ?? ""));
        const lon = parseFloat(String(msg.Location_Y ?? ""));
        if (isNaN(lat) || isNaN(lon)) return null;
        const label = (msg.Label ?? "").toString().trim();
        const scale = parseInt(String(msg.Scale ?? ""), 10);
        return {
          ...base,
          text: "",
          messageType: "location",
          location: {
            label: label || undefined,
            latitude: lat,
            longitude: lon,
            ...(isNaN(scale) ? {} : { scale }),
          },
        };
      }

      case "link": {
        const title = (msg.Title ?? "").toString().trim();
        const description = (msg.Description ?? "").toString().trim();
        const linkUrl = (msg.Url ?? "").toString().trim();
        if (!linkUrl) return null;
        return {
          ...base,
          text: "",
          messageType: "link",
          link: {
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            url: linkUrl,
          },
        };
      }

      case "file": {
        const mediaId = (msg.MediaId ?? "").toString().trim();
        const fileName = (msg.FileName ?? "").toString().trim();
        if (!mediaId) return null;
        try {
          const ext = fileName.match(/\.(\w+)$/)?.[1];
          const path = await this.downloadMedia(mediaId, ext);
          return {
            ...base,
            text: "",
            messageType: "file",
            media: [
              {
                type: "file",
                path,
                ...(fileName ? { fileName } : {}),
              },
            ],
          };
        } catch (err) {
          console.error(`[WeCom] Failed to download file: ${err}`);
          return {
            ...base,
            text: "",
            messageType: "file",
            media: [{ type: "file", fileName: fileName || undefined }],
          };
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

  private async handleAndReply(msg: InboundMessage): Promise<void> {
    if (!this.handler) return;
    const userId = msg.senderId;

    let reply: string | null;
    try {
      reply = await this.handler(msg);
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
    await retryAsync(
      async () => {
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
        const data = (await resp.json()) as {
          errcode?: number;
          errmsg?: string;
        };

        if (data.errcode && data.errcode !== 0) {
          // 42001 = token expired → force refresh then retry
          if (data.errcode === 42001) {
            this.accessToken = "";
            this.tokenExpiresAt = 0;
          }
          throw new WeComApiError(data.errcode, data.errmsg ?? "unknown");
        }
      },
      {
        attempts: 3,
        minDelayMs: 1000,
        shouldRetry: (err) => err instanceof WeComApiError && err.retryable,
      },
      "wecom-send",
    );
  }

  // ------------------------------------------------------------------
  // Access token management
  // ------------------------------------------------------------------

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    return retryAsync(
      async () => {
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
          throw new Error(
            `Failed to get access_token: ${JSON.stringify(data)}`,
          );
        }

        this.accessToken = data.access_token ?? "";
        // Refresh 5 minutes early
        this.tokenExpiresAt =
          Date.now() + ((data.expires_in ?? 7200) - 300) * 1000;
        return this.accessToken;
      },
      { attempts: 3, minDelayMs: 1000 },
      "wecom-token",
    );
  }

  // ------------------------------------------------------------------
  // Download media from WeCom media/get API
  // ------------------------------------------------------------------

  private async downloadMedia(mediaId: string, ext?: string): Promise<string> {
    return retryAsync(
      () => this.downloadMediaOnce(mediaId, ext),
      { attempts: 3, minDelayMs: 1000 },
      "wecom-media",
    );
  }

  private async downloadMediaOnce(
    mediaId: string,
    ext?: string,
  ): Promise<string> {
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
