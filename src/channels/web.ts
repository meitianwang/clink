/**
 * Web channel — browser-based chat UI with WebSocket for real-time bidirectional communication.
 *
 * Routes:
 *   GET  /              → Chat UI HTML (requires ?token)
 *   WS   /api/ws        → WebSocket connection (requires ?token, validated during upgrade)
 *   POST /api/upload    → File upload (token in query string)
 *   GET  /api/health    → Health check (no auth)
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { ChannelPlugin } from "./types.js";
import type {
  Handler,
  ToolEventCallback,
  StreamChunkCallback,
  PermissionRequestCallback,
  PermissionRequest,
} from "../types.js";
import type { WebConfig } from "../types.js";
import { loadWebConfig } from "../config.js";
import type { InboundMessage, MediaFile } from "../message.js";
import { getChatHtml } from "./web-ui.js";
import { startTunnel } from "./web-tunnel.js";
import { formatToolEvent, type ToolPayload } from "../tool-config.js";

// ---------------------------------------------------------------------------
// File upload storage
// ---------------------------------------------------------------------------

const UPLOAD_DIR = join(tmpdir(), "klaus-web-uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// WebSocket client management
// ---------------------------------------------------------------------------

interface KlausWebSocket extends WebSocket {
  isAlive: boolean;
  klausToken: string;
  klausIp: string;
}

const wsClients = new Map<string, Set<KlausWebSocket>>();

type WsEvent =
  | {
      readonly type: "message";
      readonly text: string;
      readonly id: string;
      readonly sessionId?: string;
    }
  | {
      readonly type: "stream";
      readonly chunk: string;
      readonly sessionId?: string;
    }
  | { readonly type: "merged"; readonly sessionId?: string }
  | {
      readonly type: "error";
      readonly message: string;
      readonly sessionId?: string;
    }
  | { readonly type: "ping" }
  | {
      readonly type: "tool";
      readonly data: ToolPayload;
      readonly sessionId?: string;
    }
  | {
      readonly type: "permission";
      readonly data: PermissionRequest;
      readonly sessionId?: string;
    };

function addWsClient(token: string, ws: KlausWebSocket): void {
  let clients = wsClients.get(token);
  if (!clients) {
    clients = new Set();
    wsClients.set(token, clients);
  }
  clients.add(ws);
}

function removeWsClient(token: string, ws: KlausWebSocket): void {
  const clients = wsClients.get(token);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) wsClients.delete(token);
}

function sendWsEvent(token: string, event: WsEvent): void {
  const clients = wsClients.get(token);
  if (!clients) return;
  const data = JSON.stringify(event);
  for (const ws of [...clients]) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        removeWsClient(token, ws);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Token validation (constant-time, fixed-length comparison)
// ---------------------------------------------------------------------------

function validateToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  // HMAC both values to fixed-length digests, preventing length leakage
  const key = "klaus-token-compare";
  const a = createHmac("sha256", key).update(provided).digest();
  const b = createHmac("sha256", key).update(expected).digest();
  return timingSafeEqual(a, b);
}

// Derive a short prefix for logging (never log the full token)
function tokenLabel(token: string): string {
  return token.slice(0, 8) + "...";
}

// ---------------------------------------------------------------------------
// Rate limiting (per-IP, simple sliding window)
// ---------------------------------------------------------------------------

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_MAX_REQUESTS;
}

// ---------------------------------------------------------------------------
// Pending permission requests (deferred promises for canUseTool approval)
// ---------------------------------------------------------------------------

const PERMISSION_TIMEOUT_MS = 120_000; // 2 minutes

const pendingPermissions = new Map<
  string,
  {
    resolve: (response: { allow: boolean }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage, maxSize?: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const limit = maxSize ?? 1024 * 64; // default 64 KB
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function serveHtml(url: URL, res: ServerResponse, cfg: WebConfig): void {
  const token = url.searchParams.get("token") ?? "";
  if (!validateToken(token, cfg.token)) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized: invalid or missing token");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getChatHtml());
}

// ---------------------------------------------------------------------------
// Message processing (shared by WebSocket handler)
// ---------------------------------------------------------------------------

async function processUserMessage(
  token: string,
  text: string,
  fileIds: string[],
  sessionId: string,
  handler: Handler,
  cfg: WebConfig,
): Promise<void> {
  const trimmedText = text.trim();
  if (!trimmedText && fileIds.length === 0) return;

  // Build media list from uploaded file IDs
  const media: MediaFile[] = [];
  for (const fileId of fileIds) {
    const meta = uploadedFiles.get(fileId);
    if (!meta) continue;
    media.push({
      type: meta.mediaType,
      path: meta.path,
      fileName: meta.originalName,
    });
    uploadedFiles.delete(fileId);
  }

  const sessionKey = `web:${token}:${sessionId}`;
  const hasMedia = media.length > 0;
  const messageType =
    hasMedia && trimmedText
      ? "mixed"
      : hasMedia
        ? media[0].type === "image"
          ? "image"
          : "file"
        : "text";
  const msg: InboundMessage = {
    sessionKey,
    text: trimmedText,
    messageType,
    chatType: "private",
    senderId: token,
    ...(hasMedia ? { media } : {}),
  };

  const mediaLabel = hasMedia ? ` +${media.length} file(s)` : "";
  console.log(
    `[Web] Received (web:${tokenLabel(token)}): ${trimmedText.slice(0, 120)}${mediaLabel}`,
  );

  // Stream tool events to the client via WebSocket
  const onToolEvent: ToolEventCallback = (event) => {
    try {
      sendWsEvent(token, {
        type: "tool",
        data: formatToolEvent(event),
        sessionId,
      });
    } catch (err) {
      console.error("[Web] Failed to send tool event:", err);
    }
  };

  // Stream text chunks to the client via WebSocket
  const onStreamChunk: StreamChunkCallback = (chunk) => {
    try {
      sendWsEvent(token, { type: "stream", chunk, sessionId });
    } catch (err) {
      console.error("[Web] Failed to send stream chunk:", err);
    }
  };

  // Permission request callback (only when permissions enabled)
  const onPermissionRequest: PermissionRequestCallback | undefined =
    cfg.permissions
      ? (request) => {
          return new Promise<{ allow: boolean }>((resolve) => {
            const timer = setTimeout(() => {
              pendingPermissions.delete(request.requestId);
              console.log(
                `[Web] Permission timeout for ${request.toolName} (${request.requestId})`,
              );
              resolve({ allow: false });
            }, PERMISSION_TIMEOUT_MS);
            pendingPermissions.set(request.requestId, { resolve, timer });
            sendWsEvent(token, {
              type: "permission",
              data: request,
              sessionId,
            });
          });
        }
      : undefined;

  try {
    const reply = await handler(
      msg,
      onToolEvent,
      onStreamChunk,
      onPermissionRequest,
    );
    if (reply === null) {
      console.log("[Web] Message merged into batch, skipping reply");
      sendWsEvent(token, { type: "merged", sessionId });
      return;
    }

    console.log(`[Web] Replying: ${reply.slice(0, 100)}...`);
    sendWsEvent(token, {
      type: "message",
      text: reply,
      id: Date.now().toString(36),
      sessionId,
    });
  } catch (err) {
    console.error("[Web] Handler error:", err);
    sendWsEvent(token, {
      type: "error",
      message: "An internal error occurred. Please try again.",
      sessionId,
    });
  }
}

// ---------------------------------------------------------------------------
// WebSocket message handler
// ---------------------------------------------------------------------------

type ClientWsMessage =
  | { type: "message"; text?: string; sessionId?: string; files?: string[] }
  | { type: "permission"; requestId: string; allow: boolean }
  | { type: "pong" };

function handleWsMessage(
  ws: KlausWebSocket,
  raw: RawData,
  handler: Handler,
  cfg: WebConfig,
): void {
  let parsed: ClientWsMessage;
  try {
    parsed = JSON.parse(raw.toString()) as ClientWsMessage;
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
    return;
  }

  const token = ws.klausToken;
  const ip = ws.klausIp;

  switch (parsed.type) {
    case "message": {
      if (!checkRateLimit(ip)) {
        ws.send(
          JSON.stringify({ type: "error", message: "too many requests" }),
        );
        return;
      }
      processUserMessage(
        token,
        parsed.text ?? "",
        parsed.files ?? [],
        parsed.sessionId ?? "default",
        handler,
        cfg,
      ).catch((err) => {
        console.error("[Web] processUserMessage error:", err);
      });
      break;
    }
    case "permission": {
      if (!checkRateLimit(ip)) {
        ws.send(
          JSON.stringify({ type: "error", message: "too many requests" }),
        );
        return;
      }
      const requestId = parsed.requestId ?? "";
      const pending = pendingPermissions.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingPermissions.delete(requestId);
        pending.resolve({ allow: Boolean(parsed.allow) });
      }
      break;
    }
    case "pong":
      // Client heartbeat reply, no action needed
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// File upload handler
// ---------------------------------------------------------------------------

interface UploadMeta {
  readonly path: string;
  readonly originalName: string;
  readonly mediaType: "image" | "audio" | "video" | "file";
  readonly createdAt: number;
}

const uploadedFiles = new Map<string, UploadMeta>();

// Cleanup stale uploads every 10 minutes (files older than 30 min)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, meta] of uploadedFiles) {
    if (meta.createdAt < cutoff) uploadedFiles.delete(id);
  }
}, 10 * 60_000);

function inferMediaType(
  contentType: string,
  fileName: string,
): "image" | "audio" | "video" | "file" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("video/")) return "video";
  // Fallback: check extension
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext))
    return "image";
  if (["mp3", "wav", "ogg", "m4a", "aac"].includes(ext)) return "audio";
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return "video";
  return "file";
}

async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WebConfig,
): Promise<void> {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    jsonResponse(res, 429, { error: "too many requests" });
    return;
  }

  // Token in query string for upload
  const url = new URL(req.url ?? "/", `http://localhost:${cfg.port}`);
  const token = url.searchParams.get("token") ?? "";
  if (!validateToken(token, cfg.token)) {
    jsonResponse(res, 401, { error: "unauthorized" });
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  const fileName = decodeURIComponent(url.searchParams.get("name") ?? "upload");

  // Validate content type is present
  if (!contentType) {
    jsonResponse(res, 400, { error: "missing content-type" });
    return;
  }

  const data = await readBody(req, MAX_UPLOAD_SIZE);

  // Save to temp file
  const safeBase = fileName.replace(/[^\w.\-]/g, "_");
  const diskName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeBase}`;
  const filePath = join(UPLOAD_DIR, diskName);
  writeFileSync(filePath, data);

  const fileId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const mediaType = inferMediaType(contentType, fileName);

  uploadedFiles.set(fileId, {
    path: filePath,
    originalName: fileName,
    mediaType,
    createdAt: Date.now(),
  });

  console.log(
    `[Web] Upload (${tokenLabel(token)}): ${fileName} → ${mediaType} [${data.length} bytes]`,
  );

  jsonResponse(res, 200, { id: fileId, type: mediaType, name: fileName });
}

// ---------------------------------------------------------------------------
// Request router (HTTP-only routes)
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WebConfig,
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${cfg.port}`);

  switch (url.pathname) {
    case "/":
      return serveHtml(url, res, cfg);
    case "/api/upload":
      if (req.method !== "POST") {
        jsonResponse(res, 405, { error: "method not allowed" });
        return;
      }
      return handleUpload(req, res, cfg);
    case "/api/health":
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    default:
      res.writeHead(404);
      res.end("not found");
  }
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const webPlugin: ChannelPlugin = {
  meta: {
    id: "web",
    label: "Web Chat",
    description:
      "Browser-based chat UI (localhost + optional Cloudflare Tunnel)",
  },
  capabilities: {
    dm: true,
  },
  start: async (handler: Handler) => {
    const cfg = loadWebConfig();

    const server = createServer((req, res) => {
      handleRequest(req, res, cfg).catch((err) => {
        console.error("[Web] Request error:", err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("internal error");
        }
      });
    });

    // WebSocket server (noServer mode — manual upgrade handling)
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://localhost:${cfg.port}`);
      if (url.pathname !== "/api/ws") {
        socket.destroy();
        return;
      }
      const token = url.searchParams.get("token") ?? "";
      if (!validateToken(token, cfg.token)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, token);
      });
    });

    wss.on(
      "connection",
      (rawWs: WebSocket, req: IncomingMessage, token: string) => {
        const ws = rawWs as KlausWebSocket;
        ws.isAlive = true;
        ws.klausToken = token;
        ws.klausIp = getClientIp(req);

        addWsClient(token, ws);
        console.log(`[Web] WebSocket connected: ${tokenLabel(token)}`);

        ws.on("pong", () => {
          ws.isAlive = true;
        });

        ws.on("message", (raw: RawData) => {
          handleWsMessage(ws, raw, handler, cfg);
        });

        ws.on("close", () => {
          removeWsClient(token, ws);
          console.log(`[Web] WebSocket disconnected: ${tokenLabel(token)}`);
        });

        ws.on("error", (err) => {
          console.error(
            `[Web] WebSocket error (${tokenLabel(token)}):`,
            err.message,
          );
          removeWsClient(token, ws);
        });
      },
    );

    server.listen(cfg.port, "0.0.0.0", () => {
      console.log(
        `Klaus Web channel listening on http://localhost:${cfg.port}`,
      );
      console.log(`Chat URL: http://localhost:${cfg.port}/?token=${cfg.token}`);
    });

    // Application-layer ping — 25s keepalive to prevent proxy/tunnel timeouts
    const keepalive = setInterval(() => {
      for (const [token, clients] of wsClients) {
        for (const ws of [...clients]) {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "ping" }));
            } catch {
              removeWsClient(token, ws);
            }
          } else {
            removeWsClient(token, ws);
          }
        }
      }
    }, 25_000);

    // Protocol-layer ping/pong — detect dead connections
    const deadCheck = setInterval(() => {
      for (const client of wss.clients) {
        const ws = client as KlausWebSocket;
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30_000);

    // Cloudflare Tunnel
    let tunnelChild: ReturnType<typeof startTunnel> = null;
    if (cfg.tunnel) {
      tunnelChild = startTunnel(cfg.port, cfg.token);
    }

    // Cleanup on process exit
    const cleanup = (): void => {
      clearInterval(keepalive);
      clearInterval(deadCheck);
      wss.close();
      tunnelChild?.kill();
    };
    process.once("exit", cleanup);
    process.once("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });

    // Block forever (channel contract)
    await new Promise(() => {});
  },
};
