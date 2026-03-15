/**
 * Web channel — browser-based chat UI with WebSocket for real-time bidirectional communication.
 *
 * Auth: user-based — email+password or Google OAuth, with invite code required for registration.
 *
 * Routes:
 *   GET  /                    → Chat UI HTML (requires login)
 *   GET  /login               → Login/Register page
 *   GET  /admin               → Admin panel (admin role only)
 *   WS   /api/ws              → WebSocket connection (cookie auth)
 *   POST /api/auth/register   → Register with invite code
 *   POST /api/auth/login      → Login with email+password
 *   POST /api/auth/logout     → Logout
 *   GET  /api/auth/me         → Current user info
 *   GET  /api/auth/google     → Google OAuth redirect
 *   GET  /api/auth/google/callback → Google OAuth callback
 *   POST /api/upload          → File upload
 *   GET  /api/history         → Session message history
 *   GET  /api/sessions        → List sessions
 *   DELETE /api/sessions      → Delete session
 *   GET/POST/DELETE /api/admin/invites → Invite code management (admin only)
 *   GET  /api/admin/users     → User management (admin only)
 *   PATCH /api/admin/users    → Update user (admin only)
 *   GET  /api/admin/sessions  → Browse any user's sessions (admin only)
 *   GET  /api/admin/history   → View any session's history (admin only)
 *   GET/PATCH /api/admin/settings → All settings: general, web, session, transcripts, cron (admin only)
 *   GET/POST/PATCH/DELETE /api/admin/cron/tasks → Cron task CRUD (admin only)
 *   GET  /api/health          → Health check (no auth)
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdirSync, rmSync, watch, type FSWatcher } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ensureWorkspace, getWorkspacePath } from "../workspace.js";
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
import {
  loadWebConfig,
  loadConfig,
  saveConfig,
  loadSessionConfig,
  loadTranscriptsConfig,
  loadCronConfig,
  CONFIG_FILE,
} from "../config.js";
import type {
  CronTask,
  CronTaskStatus,
  CronSchedulerStatus,
} from "../types.js";
import type { InboundMessage, MediaFile } from "../message.js";
import { getChatHtml } from "./web-ui.js";
import { getAdminHtml } from "./web-admin-ui.js";
import { getLoginHtml } from "./web-login-ui.js";
import { startTunnel } from "./web-tunnel.js";
import { formatToolEvent, type ToolPayload } from "../tool-config.js";
import type { MessageStore } from "../message-store.js";
import type { InviteStore } from "../invite-store.js";
import type { SessionStore } from "../session-store.js";
import type { UserStore, User } from "../user-store.js";
import {
  getSessionToken,
  handleAuthRegister,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthMe,
  handleAuthProfile,
  handleAvatarUpload,
  handleAvatarServe,
  handleGoogleRedirect,
  handleGoogleCallback,
} from "./web-auth.js";
import { DEFAULT_PERSONA } from "../persona.js";

// ---------------------------------------------------------------------------
// File upload storage
// ---------------------------------------------------------------------------

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// File download token registry
// ---------------------------------------------------------------------------

interface DownloadEntry {
  readonly path: string;
  readonly name: string;
  readonly userId: string;
  readonly expiresAt: number;
}

const downloadTokens = new Map<string, DownloadEntry>();
const DOWNLOAD_TOKEN_TTL_MS = 30 * 60_000; // 30 minutes

// Cleanup expired download tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of downloadTokens) {
    if (now >= entry.expiresAt) downloadTokens.delete(token);
  }
}, 5 * 60_000);

/** Allowed directory prefixes for downloadable files. */
const DOWNLOAD_ALLOWED_DIRS = ["/tmp", tmpdir()];

function registerDownloadToken(
  filePath: string,
  userId: string,
): { token: string; name: string } {
  // Resolve to absolute path and block path traversal
  const resolved = resolve(filePath);
  const userWorkspace = getWorkspacePath(userId);
  const allowed =
    DOWNLOAD_ALLOWED_DIRS.some(
      (dir) => resolved === dir || resolved.startsWith(dir + "/"),
    ) ||
    resolved === userWorkspace ||
    resolved.startsWith(userWorkspace + "/");
  if (!allowed) {
    throw new Error(
      `Download path not allowed: ${resolved} (must be under /tmp or user workspace)`,
    );
  }

  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const name = resolved.split("/").pop() ?? "file";
  downloadTokens.set(token, {
    path: resolved,
    name,
    userId,
    expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS,
  });
  return { token, name };
}

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "text/",
  "application/pdf",
  "application/json",
  "application/zip",
  "application/gzip",
  "application/xml",
  // MS Office
  "application/msword",
  "application/vnd.ms-",
  "application/vnd.openxmlformats-officedocument.",
  // OpenDocument
  "application/vnd.oasis.opendocument.",
  // Other common docs
  "application/rtf",
  "application/x-yaml",
] as const;

// Fallback: allow upload when MIME is generic but extension is known-safe
const ALLOWED_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "rtf",
  "pdf",
  "txt",
  "md",
  "csv",
  "json",
  "xml",
  "yaml",
  "yml",
  "toml",
  "log",
  "html",
  "js",
  "ts",
  "py",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "sh",
  "bat",
  "zip",
  "gz",
  "tar",
]);

// ---------------------------------------------------------------------------
// Store references (set by index.ts)
// ---------------------------------------------------------------------------

let messageStoreRef: MessageStore | null = null;
let inviteStoreRef: InviteStore | null = null;
let sessionStoreRef: SessionStore | null = null;
let userStoreRef: UserStore | null = null;
let chatManagerRef: {
  getDefaultModel(): string | undefined;
  setDefaultModel(m: string | undefined): void;
  setPersona(persona: string): void;
  reset(sessionKey: string): Promise<void>;
} | null = null;

export function setMessageStore(store: MessageStore): void {
  messageStoreRef = store;
}

export function setInviteStore(store: InviteStore): void {
  inviteStoreRef = store;
}

export function setSessionStore(store: SessionStore): void {
  sessionStoreRef = store;
}

export function setUserStore(store: UserStore): void {
  userStoreRef = store;
}

export function setChatManager(manager: {
  getDefaultModel(): string | undefined;
  setDefaultModel(m: string | undefined): void;
  setPersona(persona: string): void;
  reset(sessionKey: string): Promise<void>;
}): void {
  chatManagerRef = manager;
}

// Cron scheduler reference (optional — set from index.ts when cron is available)
let cronSchedulerRef: {
  getStatus(): readonly CronTaskStatus[];
  getSchedulerStatus(): CronSchedulerStatus;
  addTask(task: CronTask): void;
  editTask(id: string, patch: Partial<CronTask>): boolean;
  removeTask(id: string): boolean;
  runTask(id: string): Promise<unknown>;
} | null = null;

export function setCronScheduler(scheduler: typeof cronSchedulerRef): void {
  cronSchedulerRef = scheduler;
}

// ---------------------------------------------------------------------------
// WebSocket client management (keyed by userId instead of token)
// ---------------------------------------------------------------------------

interface KlausWebSocket extends WebSocket {
  isAlive: boolean;
  klausUserId: string;
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
    }
  | { readonly type: "config_updated" }
  | {
      readonly type: "file";
      readonly url: string;
      readonly name: string;
      readonly sessionId?: string;
    };

function addWsClient(userId: string, ws: KlausWebSocket): void {
  let clients = wsClients.get(userId);
  if (!clients) {
    clients = new Set();
    wsClients.set(userId, clients);
  }
  clients.add(ws);
}

function removeWsClient(userId: string, ws: KlausWebSocket): void {
  const clients = wsClients.get(userId);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) wsClients.delete(userId);
}

function sendWsEvent(userId: string, event: WsEvent): void {
  const clients = wsClients.get(userId);
  if (!clients) return;
  const data = JSON.stringify(event);
  for (const ws of [...clients]) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        removeWsClient(userId, ws);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

type AuthResult =
  | { readonly kind: "admin"; readonly user: User }
  | { readonly kind: "user"; readonly user: User }
  | { readonly kind: "invalid" };

function authenticateRequest(req: IncomingMessage): AuthResult {
  if (!userStoreRef) return { kind: "invalid" };
  const token = getSessionToken(req);
  const auth = userStoreRef.validateSession(token);
  if (!auth) return { kind: "invalid" };
  return {
    kind: auth.user.role === "admin" ? "admin" : "user",
    user: auth.user,
  };
}

// Short label for logging
function userLabel(user: User): string {
  return `${user.email.split("@")[0]}(${user.id.slice(0, 6)})`;
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
// Pending permission requests
// ---------------------------------------------------------------------------

const PERMISSION_TIMEOUT_MS = 120_000;

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

export function readBody(
  req: IncomingMessage,
  maxSize?: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const limit = maxSize ?? 1024 * 64;
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

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' fonts.googleapis.com 'unsafe-inline'; font-src fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:;",
};

function serveHtmlPage(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    ...SECURITY_HEADERS,
  });
  res.end(html);
}

async function servePublicFile(
  res: ServerResponse,
  filename: string,
  contentType: string,
): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname } = await import("node:path");
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const candidates = [
    join(__dirname, "..", "public", filename),
    join(__dirname, "..", "..", "public", filename),
    join(process.cwd(), "public", filename),
  ];
  for (const p of candidates) {
    try {
      const data = readFileSync(p);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      });
      res.end(data);
      return;
    } catch {
      // try next
    }
  }
  res.writeHead(404);
  res.end("not found");
}

function getClientIp(req: IncomingMessage): string {
  // Only use socket address for rate limiting — X-Forwarded-For is client-spoofable
  return req.socket.remoteAddress ?? "unknown";
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function serveHtml(req: IncomingMessage, res: ServerResponse): void {
  const auth = authenticateRequest(req);
  if (auth.kind === "invalid") {
    res.writeHead(302, { Location: "/login" });
    res.end();
    return;
  }
  serveHtmlPage(res, getChatHtml());
}

function serveLogin(res: ServerResponse, cfg: WebConfig): void {
  const isFirst = userStoreRef ? userStoreRef.isFirstUser() : false;
  serveHtmlPage(res, getLoginHtml(!!cfg.google, isFirst));
}

function serveAdmin(req: IncomingMessage, res: ServerResponse): void {
  const auth = authenticateRequest(req);
  if (auth.kind !== "admin") {
    res.writeHead(302, { Location: "/login" });
    res.end();
    return;
  }
  serveHtmlPage(res, getAdminHtml());
}

// ---------------------------------------------------------------------------
// Message processing (shared by WebSocket handler)
// ---------------------------------------------------------------------------

async function processUserMessage(
  userId: string,
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

  const sessionKey = `web:${userId}:${sessionId}`;
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
    senderId: userId,
    ...(hasMedia ? { media } : {}),
  };

  const mediaLabel = hasMedia ? ` +${media.length} file(s)` : "";
  console.log(
    `[Web] Received (${userId.slice(0, 8)}): ${trimmedText.slice(0, 120)}${mediaLabel}`,
  );

  // Track pending send_file tool calls for file delivery
  const pendingSendFiles = new Map<
    string,
    { filePath: string; fileName?: string }
  >();

  // Stream tool events to the client via WebSocket
  const onToolEvent: ToolEventCallback = (event) => {
    try {
      // Intercept send_file tool: capture input on start, deliver on success
      if (event.type === "tool_start" && event.toolName === "send_file") {
        const input = event.input ?? {};
        const filePath = input.file_path as string | undefined;
        if (filePath) {
          pendingSendFiles.set(event.toolUseId, {
            filePath: String(filePath),
            fileName: input.file_name ? String(input.file_name) : undefined,
          });
        }
      } else if (
        event.type === "tool_result" &&
        pendingSendFiles.has(event.toolUseId)
      ) {
        const pending = pendingSendFiles.get(event.toolUseId)!;
        pendingSendFiles.delete(event.toolUseId);
        if (!event.isError) {
          try {
            const { token, name } = registerDownloadToken(
              pending.filePath,
              userId,
            );
            const displayName = pending.fileName ?? name;
            sendWsEvent(userId, {
              type: "file",
              url: `/api/files/${token}`,
              name: displayName,
              sessionId,
            });
            console.log(
              `[Web] send_file: ${displayName} (${token.slice(0, 8)}...)`,
            );
          } catch (err) {
            console.error(
              `[Web] send_file delivery failed for ${pending.filePath}:`,
              err,
            );
          }
        }
      }

      sendWsEvent(userId, {
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
      sendWsEvent(userId, { type: "stream", chunk, sessionId });
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
            sendWsEvent(userId, {
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
      sendWsEvent(userId, { type: "merged", sessionId });
      return;
    }

    // Extract [[file:/path/to/file]] markers and register downloads
    const fileMarkerRe = /\[\[file:(.+?)\]\]/g;
    let displayText = reply;
    let match: RegExpExecArray | null;
    while ((match = fileMarkerRe.exec(reply)) !== null) {
      const filePath = match[1].trim();
      try {
        const { token, name } = registerDownloadToken(filePath, userId);
        sendWsEvent(userId, {
          type: "file",
          url: `/api/files/${token}`,
          name,
          sessionId,
        });
        console.log(
          `[Web] File available for download: ${name} (${token.slice(0, 8)}...)`,
        );
      } catch (err) {
        console.error(`[Web] Failed to register file ${filePath}:`, err);
      }
    }
    displayText = displayText.replace(fileMarkerRe, "").trim();

    console.log(`[Web] Replying: ${displayText.slice(0, 100)}...`);
    sendWsEvent(userId, {
      type: "message",
      text: displayText,
      id: Date.now().toString(36),
      sessionId,
    });
  } catch (err) {
    console.error("[Web] Handler error:", err);
    sendWsEvent(userId, {
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

  const userId = ws.klausUserId;
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
        userId,
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

// Cleanup stale upload metadata every 10 minutes (entries older than 30 min)
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
): Promise<void> {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    jsonResponse(res, 429, { error: "too many requests" });
    return;
  }

  const auth = authenticateRequest(req);
  if (auth.kind === "invalid") {
    jsonResponse(res, 401, { error: "unauthorized" });
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const contentType = req.headers["content-type"] ?? "";
  const fileName = decodeURIComponent(url.searchParams.get("name") ?? "upload");

  if (!contentType) {
    jsonResponse(res, 400, { error: "missing content-type" });
    return;
  }

  // Validate MIME type against whitelist
  const mimeAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
    contentType.startsWith(prefix),
  );
  // Fallback: if MIME is generic/unknown, check file extension
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!mimeAllowed && !ALLOWED_EXTENSIONS.has(ext)) {
    jsonResponse(res, 415, { error: "unsupported media type" });
    return;
  }

  const data = await readBody(req, MAX_UPLOAD_SIZE);

  // Sanitize file name: basename only, strip unsafe chars
  const baseName = fileName.split(/[\\/]/).pop() ?? "upload";
  const safeBase = baseName.replace(/[^\w.\-]/g, "_");
  const diskName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeBase}`;

  // Store uploads in user's workspace uploads/ subdirectory
  const userUploadDir = join(ensureWorkspace(auth.user.id), "uploads");
  mkdirSync(userUploadDir, { recursive: true });
  const filePath = join(userUploadDir, diskName);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, data);

  const fileId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const mediaType = inferMediaType(contentType, baseName);

  uploadedFiles.set(fileId, {
    path: filePath,
    originalName: baseName,
    mediaType,
    createdAt: Date.now(),
  });

  console.log(
    `[Web] Upload (${userLabel(auth.user)}): ${fileName} → ${mediaType} [${data.length} bytes]`,
  );

  jsonResponse(res, 200, { id: fileId, type: mediaType, name: fileName });
}

// ---------------------------------------------------------------------------
// Admin: shared auth guard (cookie-based, checks role)
// ---------------------------------------------------------------------------

function adminAuth(req: IncomingMessage, res: ServerResponse): User | null {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    jsonResponse(res, 429, { error: "too many requests" });
    return null;
  }
  const auth = authenticateRequest(req);
  if (auth.kind !== "admin") {
    jsonResponse(res, 401, { error: "admin access required" });
    return null;
  }
  return auth.user;
}

// ---------------------------------------------------------------------------
// Admin: invite code CRUD
// ---------------------------------------------------------------------------

async function handleAdminInvites(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!adminAuth(req, res)) return;

  if (!inviteStoreRef) {
    jsonResponse(res, 503, { error: "invite store unavailable" });
    return;
  }

  if (req.method === "GET") {
    const invites = inviteStoreRef.list();
    jsonResponse(res, 200, { invites });
    return;
  }

  if (req.method === "POST") {
    const body = await readBody(req, 1024);
    let label = "";
    try {
      const parsed = JSON.parse(body.toString()) as Record<string, unknown>;
      label =
        typeof parsed.label === "string" ? parsed.label.slice(0, 100) : "";
    } catch {
      // Empty label is fine
    }
    const invite = inviteStoreRef.create(label);
    console.log(
      `[Web] Created invite code: ${invite.code.slice(0, 8)}... (label: ${label || "(none)"})`,
    );
    jsonResponse(res, 201, { invite });
    return;
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url ?? "/", "http://localhost");
    const code = url.searchParams.get("code") ?? "";
    if (!code) {
      jsonResponse(res, 400, { error: "missing code parameter" });
      return;
    }
    const deleted = inviteStoreRef.delete(code);
    if (!deleted) {
      jsonResponse(res, 404, { error: "invite code not found" });
      return;
    }
    console.log(`[Web] Deleted invite code: ${code.slice(0, 8)}...`);
    jsonResponse(res, 200, { deleted: true });
    return;
  }

  jsonResponse(res, 405, { error: "method not allowed" });
}

// ---------------------------------------------------------------------------
// Admin: user management
// ---------------------------------------------------------------------------

async function handleAdminUsers(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!adminAuth(req, res)) return;
  if (!userStoreRef) {
    jsonResponse(res, 503, { error: "unavailable" });
    return;
  }

  if (req.method === "GET") {
    const users = userStoreRef.listUsers();
    // Enrich with session/message stats
    const enriched = await Promise.all(
      users.map(async (u) => {
        let sessionCount = 0;
        let totalMessages = 0;
        if (messageStoreRef) {
          const prefix = `web:${u.id}:`;
          const sessions = await messageStoreRef.listSessions(prefix);
          sessionCount = sessions.length;
          totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
        }
        return {
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          inviteCode: u.inviteCode,
          sessionCount,
          totalMessages,
        };
      }),
    );
    jsonResponse(res, 200, { users: enriched });
    return;
  }

  if (req.method === "PATCH") {
    const body = await readBody(req, 1024);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.toString()) as Record<string, unknown>;
    } catch {
      jsonResponse(res, 400, { error: "invalid JSON" });
      return;
    }

    const userId = String(parsed.userId ?? "");
    if (!userId) {
      jsonResponse(res, 400, { error: "missing userId" });
      return;
    }

    if (typeof parsed.isActive === "boolean") {
      userStoreRef.setActive(userId, parsed.isActive);
    }
    if (parsed.role === "admin" || parsed.role === "user") {
      userStoreRef.setRole(userId, parsed.role);
    }

    const updated = userStoreRef.getUserById(userId);
    if (!updated) {
      jsonResponse(res, 404, { error: "user not found" });
      return;
    }
    jsonResponse(res, 200, { user: updated });
    return;
  }

  jsonResponse(res, 405, { error: "method not allowed" });
}

// ---------------------------------------------------------------------------
// Admin: browse sessions for any user
// ---------------------------------------------------------------------------

const VALID_USER_ID_RE = /^[0-9a-f]{32}$/;

async function handleAdminSessions(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!adminAuth(req, res)) return;
  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "method not allowed" });
    return;
  }
  if (!messageStoreRef) {
    jsonResponse(res, 503, { error: "unavailable" });
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const userId = url.searchParams.get("userId") ?? "";
  if (!userId || !VALID_USER_ID_RE.test(userId)) {
    jsonResponse(res, 400, { error: "missing or invalid userId" });
    return;
  }

  const prefix = `web:${userId}:`;
  const sessions = await messageStoreRef.listSessions(prefix);

  const enriched = sessions.map((s) => {
    const sessionKey = `web:${userId}:${s.sessionId}`;
    const persisted = sessionStoreRef?.get(sessionKey);
    return { ...s, model: persisted?.model ?? null };
  });

  jsonResponse(res, 200, { sessions: enriched });
}

// ---------------------------------------------------------------------------
// Admin: read conversation history for any session
// ---------------------------------------------------------------------------

async function handleAdminHistory(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!adminAuth(req, res)) return;
  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "method not allowed" });
    return;
  }
  if (!messageStoreRef) {
    jsonResponse(res, 503, { error: "unavailable" });
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const userId = url.searchParams.get("userId") ?? "";
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (!userId || !VALID_USER_ID_RE.test(userId)) {
    jsonResponse(res, 400, { error: "missing or invalid userId" });
    return;
  }
  if (!sessionId || !/^[\w\-]{1,64}$/.test(sessionId)) {
    jsonResponse(res, 400, { error: "missing or invalid sessionId" });
    return;
  }

  const sessionKey = `web:${userId}:${sessionId}`;
  const messages = await messageStoreRef.readHistory(sessionKey);

  jsonResponse(res, 200, { messages });
}

// ---------------------------------------------------------------------------
// Admin: settings (all config sections except tunnel)
// ---------------------------------------------------------------------------

const ALLOWED_MODELS: Record<string, string> = {
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
};

/** Read a positive number from a raw value, fallback if invalid. */
function posNum(raw: unknown, fallback: number): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Build the full settings response from current config. */
function buildSettingsResponse(): Record<string, unknown> {
  const cfg = loadConfig();
  const webCfg = (cfg.web as Record<string, unknown>) ?? {};
  const sessionCfg = (cfg.session as Record<string, unknown>) ?? {};
  const transcriptsCfg = (cfg.transcripts as Record<string, unknown>) ?? {};
  const cronCfg = (cfg.cron as Record<string, unknown>) ?? {};

  return {
    // General
    model: chatManagerRef?.getDefaultModel() ?? (cfg.model as string) ?? "",
    persona: (cfg.persona as string) ?? "",
    availableModels: Object.entries(ALLOWED_MODELS).map(([id, label]) => ({
      id,
      label,
    })),
    // Web
    web: {
      port: Number(webCfg.port ?? process.env.KLAUS_WEB_PORT ?? 3000),
      permissions: Boolean(
        webCfg.permissions ?? process.env.KLAUS_WEB_PERMISSIONS === "true",
      ),
      session_max_age_days: posNum(webCfg.session_max_age_days, 7),
    },
    // Session
    session: {
      idle_minutes: posNum(sessionCfg.idle_minutes, 240),
      max_entries: Math.floor(posNum(sessionCfg.max_entries, 100)),
      max_age_days: posNum(sessionCfg.max_age_days, 7),
    },
    // Transcripts
    transcripts: {
      max_files: Math.floor(posNum(transcriptsCfg.max_files, 200)),
      max_age_days: posNum(transcriptsCfg.max_age_days, 30),
    },
    // Cron (global settings only, tasks via separate endpoint)
    cron: {
      enabled: cronCfg.enabled === true,
      max_concurrent_runs:
        cronCfg.max_concurrent_runs != null
          ? Math.floor(posNum(cronCfg.max_concurrent_runs, 0))
          : null,
    },
  };
}

async function handleAdminSettings(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!adminAuth(req, res)) return;

  if (req.method === "GET") {
    jsonResponse(res, 200, buildSettingsResponse());
    return;
  }

  if (req.method === "PATCH") {
    const body = await readBody(req, 8192);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.toString()) as Record<string, unknown>;
    } catch {
      jsonResponse(res, 400, { error: "invalid JSON" });
      return;
    }

    const cfg = loadConfig();

    // --- General ---

    if ("model" in parsed) {
      const model = String(parsed.model ?? "").trim();
      if (model && !ALLOWED_MODELS[model]) {
        jsonResponse(res, 400, { error: "invalid_model" });
        return;
      }
      if (model) {
        cfg.model = model;
        chatManagerRef?.setDefaultModel(model);
      } else {
        delete cfg.model;
        chatManagerRef?.setDefaultModel(undefined);
      }
    }

    if ("persona" in parsed) {
      const persona = String(parsed.persona ?? "").trim();
      if (persona) {
        cfg.persona = persona;
        chatManagerRef?.setPersona(persona);
      } else {
        delete cfg.persona;
        chatManagerRef?.setPersona(DEFAULT_PERSONA);
      }
    }

    // --- Web ---

    if ("web" in parsed && typeof parsed.web === "object" && parsed.web) {
      const webPatch = parsed.web as Record<string, unknown>;
      const webCfg = (cfg.web as Record<string, unknown>) ?? {};

      if ("port" in webPatch) {
        const port = Math.floor(Number(webPatch.port));
        if (port > 0 && port <= 65535) webCfg.port = port;
      }
      if ("permissions" in webPatch) {
        webCfg.permissions = Boolean(webPatch.permissions);
      }
      if ("session_max_age_days" in webPatch) {
        const v = Number(webPatch.session_max_age_days);
        if (Number.isFinite(v) && v > 0) webCfg.session_max_age_days = v;
      }

      cfg.web = webCfg;
    }

    // --- Session ---

    if (
      "session" in parsed &&
      typeof parsed.session === "object" &&
      parsed.session
    ) {
      const sesPatch = parsed.session as Record<string, unknown>;
      const sesCfg = (cfg.session as Record<string, unknown>) ?? {};

      if ("idle_minutes" in sesPatch) {
        const v = Number(sesPatch.idle_minutes);
        if (Number.isFinite(v) && v > 0) sesCfg.idle_minutes = v;
      }
      if ("max_entries" in sesPatch) {
        const v = Math.floor(Number(sesPatch.max_entries));
        if (v > 0) sesCfg.max_entries = v;
      }
      if ("max_age_days" in sesPatch) {
        const v = Number(sesPatch.max_age_days);
        if (Number.isFinite(v) && v > 0) sesCfg.max_age_days = v;
      }

      cfg.session = sesCfg;
    }

    // --- Transcripts ---

    if (
      "transcripts" in parsed &&
      typeof parsed.transcripts === "object" &&
      parsed.transcripts
    ) {
      const txPatch = parsed.transcripts as Record<string, unknown>;
      const txCfg = (cfg.transcripts as Record<string, unknown>) ?? {};

      if ("max_files" in txPatch) {
        const v = Math.floor(Number(txPatch.max_files));
        if (v > 0) txCfg.max_files = v;
      }
      if ("max_age_days" in txPatch) {
        const v = Number(txPatch.max_age_days);
        if (Number.isFinite(v) && v > 0) txCfg.max_age_days = v;
      }

      cfg.transcripts = txCfg;
    }

    // --- Cron (global settings) ---

    if ("cron" in parsed && typeof parsed.cron === "object" && parsed.cron) {
      const cronPatch = parsed.cron as Record<string, unknown>;
      const cronCfg = (cfg.cron as Record<string, unknown>) ?? {};

      if ("enabled" in cronPatch) {
        cronCfg.enabled = Boolean(cronPatch.enabled);
      }
      if ("max_concurrent_runs" in cronPatch) {
        const v = cronPatch.max_concurrent_runs;
        if (v === null || v === "") {
          delete cronCfg.max_concurrent_runs;
        } else {
          const n = Math.floor(Number(v));
          if (n > 0) cronCfg.max_concurrent_runs = n;
        }
      }

      cfg.cron = cronCfg;
    }

    saveConfig(cfg);
    jsonResponse(res, 200, buildSettingsResponse());
    return;
  }

  jsonResponse(res, 405, { error: "method not allowed" });
}

// ---------------------------------------------------------------------------
// Admin: cron tasks CRUD
// ---------------------------------------------------------------------------

async function handleAdminCronTasks(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!adminAuth(req, res)) return;

  // GET — list all tasks with status
  if (req.method === "GET") {
    if (cronSchedulerRef) {
      const tasks = cronSchedulerRef.getStatus();
      const scheduler = cronSchedulerRef.getSchedulerStatus();
      jsonResponse(res, 200, { tasks, scheduler });
    } else {
      // No scheduler — read from config
      const cronCfg = loadCronConfig();
      const tasks = cronCfg.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        schedule: t.schedule,
        prompt: t.prompt,
        model: t.model,
        enabled: t.enabled !== false,
        nextRun: null,
        lastRun: null,
        consecutiveErrors: 0,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
      jsonResponse(res, 200, {
        tasks,
        scheduler: {
          running: false,
          taskCount: tasks.length,
          activeJobs: 0,
          runningTasks: 0,
          maxConcurrentRuns: null,
          nextWakeAt: null,
        },
      });
    }
    return;
  }

  // POST — create task
  if (req.method === "POST") {
    const body = await readBody(req, 4096);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.toString()) as Record<string, unknown>;
    } catch {
      jsonResponse(res, 400, { error: "invalid JSON" });
      return;
    }

    const id = String(parsed.id ?? "").trim();
    const schedule = String(parsed.schedule ?? "").trim();
    const prompt = String(parsed.prompt ?? "").trim();
    if (!id || !schedule || !prompt) {
      jsonResponse(res, 400, {
        error: "id, schedule, and prompt are required",
      });
      return;
    }

    const task: CronTask = {
      id,
      schedule,
      prompt,
      name: parsed.name ? String(parsed.name) : undefined,
      description: parsed.description ? String(parsed.description) : undefined,
      model: parsed.model ? String(parsed.model) : undefined,
      enabled: parsed.enabled !== false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (cronSchedulerRef) {
      cronSchedulerRef.addTask(task);
    } else {
      // Persist to config directly
      const cfg = loadConfig();
      const cronCfg = (cfg.cron as Record<string, unknown>) ?? {};
      const tasks = Array.isArray(cronCfg.tasks) ? [...cronCfg.tasks] : [];
      tasks.push(task);
      cronCfg.tasks = tasks;
      cfg.cron = cronCfg;
      saveConfig(cfg);
    }

    jsonResponse(res, 201, { ok: true, task });
    return;
  }

  // PATCH — update task
  if (req.method === "PATCH") {
    const url = new URL(req.url ?? "", "http://localhost");
    const id = url.searchParams.get("id") ?? "";
    if (!id) {
      jsonResponse(res, 400, { error: "id query parameter required" });
      return;
    }

    const body = await readBody(req, 4096);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.toString()) as Record<string, unknown>;
    } catch {
      jsonResponse(res, 400, { error: "invalid JSON" });
      return;
    }

    const patch: Record<string, unknown> = {};
    if ("schedule" in parsed) patch.schedule = String(parsed.schedule);
    if ("prompt" in parsed) patch.prompt = String(parsed.prompt);
    if ("name" in parsed)
      patch.name = parsed.name ? String(parsed.name) : undefined;
    if ("description" in parsed)
      patch.description = parsed.description
        ? String(parsed.description)
        : undefined;
    if ("model" in parsed)
      patch.model = parsed.model ? String(parsed.model) : undefined;
    if ("enabled" in parsed) patch.enabled = Boolean(parsed.enabled);

    if (cronSchedulerRef) {
      const ok = cronSchedulerRef.editTask(id, patch as Partial<CronTask>);
      if (!ok) {
        jsonResponse(res, 404, { error: "task not found" });
        return;
      }
    } else {
      jsonResponse(res, 503, { error: "cron scheduler not running" });
      return;
    }

    jsonResponse(res, 200, { ok: true });
    return;
  }

  // DELETE — remove task
  if (req.method === "DELETE") {
    const url = new URL(req.url ?? "", "http://localhost");
    const id = url.searchParams.get("id") ?? "";
    if (!id) {
      jsonResponse(res, 400, { error: "id query parameter required" });
      return;
    }

    if (cronSchedulerRef) {
      const ok = cronSchedulerRef.removeTask(id);
      if (!ok) {
        jsonResponse(res, 404, { error: "task not found" });
        return;
      }
    } else {
      jsonResponse(res, 503, { error: "cron scheduler not running" });
      return;
    }

    jsonResponse(res, 200, { ok: true });
    return;
  }

  jsonResponse(res, 405, { error: "method not allowed" });
}

// ---------------------------------------------------------------------------
// File download handler
// ---------------------------------------------------------------------------

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  json: "application/json",
  zip: "application/zip",
  gz: "application/gzip",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
};

async function handleFileDownload(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
): Promise<void> {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    jsonResponse(res, 429, { error: "too many requests" });
    return;
  }

  const auth = authenticateRequest(req);
  if (auth.kind === "invalid") {
    jsonResponse(res, 401, { error: "unauthorized" });
    return;
  }

  // Validate token format (alphanumeric only)
  if (!/^[a-z0-9]+$/.test(token)) {
    jsonResponse(res, 400, { error: "invalid token" });
    return;
  }

  const entry = downloadTokens.get(token);
  if (!entry) {
    jsonResponse(res, 404, { error: "file not found or expired" });
    return;
  }

  // Only the same user (or admin) can download
  if (entry.userId !== auth.user.id && auth.kind !== "admin") {
    jsonResponse(res, 403, { error: "forbidden" });
    return;
  }

  // Check expiry
  if (Date.now() >= entry.expiresAt) {
    downloadTokens.delete(token);
    jsonResponse(res, 410, { error: "download link expired" });
    return;
  }

  const { stat, createReadStream } = await import("node:fs/promises").then(
    async (fsp) => ({
      stat: fsp.stat,
      createReadStream: (await import("node:fs")).createReadStream,
    }),
  );

  try {
    const fileStat = await stat(entry.path);
    if (!fileStat.isFile()) {
      jsonResponse(res, 404, { error: "file not found" });
      return;
    }
    if (fileStat.size > MAX_DOWNLOAD_SIZE) {
      jsonResponse(res, 413, { error: "file too large" });
      return;
    }

    const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(entry.name)}"`,
      "Content-Length": fileStat.size,
      "Cache-Control": "private, no-cache",
    });

    const stream = createReadStream(entry.path);
    stream.pipe(res);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
  } catch {
    jsonResponse(res, 404, { error: "file not found" });
  }
}

// ---------------------------------------------------------------------------
// Request router
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
      return serveHtml(req, res);
    case "/login":
      return serveLogin(res, cfg);
    case "/admin":
      return serveAdmin(req, res);
    case "/logo.png":
      return servePublicFile(res, "logo.png", "image/png");
    case "/avatar.jpg":
      return servePublicFile(res, "avatar.jpg", "image/jpeg");

    // Auth routes
    case "/api/auth/register":
      if (!inviteStoreRef || !userStoreRef) {
        jsonResponse(res, 503, { error: "not ready" });
        return;
      }
      return handleAuthRegister(req, res, cfg, userStoreRef, inviteStoreRef);
    case "/api/auth/login":
      if (!userStoreRef) {
        jsonResponse(res, 503, { error: "not ready" });
        return;
      }
      return handleAuthLogin(req, res, cfg, userStoreRef);
    case "/api/auth/logout":
      if (!userStoreRef) {
        jsonResponse(res, 503, { error: "not ready" });
        return;
      }
      return handleAuthLogout(req, res, userStoreRef);
    case "/api/auth/me":
      if (!userStoreRef) {
        jsonResponse(res, 503, { error: "not ready" });
        return;
      }
      return handleAuthMe(req, res, userStoreRef, cfg);
    case "/api/auth/profile": {
      const profIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "";
      if (!checkRateLimit(profIp)) {
        jsonResponse(res, 429, { error: "too_many_requests" });
        return;
      }
      if (!userStoreRef) {
        jsonResponse(res, 503, { error: "not ready" });
        return;
      }
      return handleAuthProfile(req, res, userStoreRef);
    }
    case "/api/auth/avatar": {
      const avatarIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "";
      if (!checkRateLimit(avatarIp)) {
        jsonResponse(res, 429, { error: "too_many_requests" });
        return;
      }
      if (!userStoreRef) {
        jsonResponse(res, 503, { error: "not ready" });
        return;
      }
      return handleAvatarUpload(req, res, userStoreRef);
    }
    case "/api/auth/google":
      return handleGoogleRedirect(req, res, cfg);
    case "/api/auth/google/callback":
      if (!userStoreRef || !inviteStoreRef) {
        jsonResponse(res, 503, { error: "not ready" });
        return;
      }
      return handleGoogleCallback(req, res, cfg, userStoreRef, inviteStoreRef);

    // Admin routes
    case "/api/admin/invites":
      return handleAdminInvites(req, res);
    case "/api/admin/users":
      return handleAdminUsers(req, res);
    case "/api/admin/sessions":
      return handleAdminSessions(req, res);
    case "/api/admin/history":
      return handleAdminHistory(req, res);
    case "/api/admin/settings":
      return handleAdminSettings(req, res);
    case "/api/admin/cron/tasks":
      return handleAdminCronTasks(req, res);

    // Upload
    case "/api/upload":
      if (req.method !== "POST") {
        jsonResponse(res, 405, { error: "method not allowed" });
        return;
      }
      return handleUpload(req, res);

    // History
    case "/api/history": {
      if (req.method !== "GET") {
        jsonResponse(res, 405, { error: "method not allowed" });
        return;
      }
      const histIp = getClientIp(req);
      if (!checkRateLimit(histIp)) {
        jsonResponse(res, 429, { error: "too many requests" });
        return;
      }
      const histAuth = authenticateRequest(req);
      if (histAuth.kind === "invalid") {
        jsonResponse(res, 401, { error: "unauthorized" });
        return;
      }
      const histSessionId = url.searchParams.get("sessionId") ?? "default";
      if (!/^[\w\-]{1,64}$/.test(histSessionId)) {
        jsonResponse(res, 400, { error: "invalid sessionId" });
        return;
      }
      if (!messageStoreRef) {
        jsonResponse(res, 503, { error: "history unavailable" });
        return;
      }
      const histKey = `web:${histAuth.user.id}:${histSessionId}`;
      const limitStr = url.searchParams.get("limit") ?? "200";
      const limit = Math.min(Math.max(parseInt(limitStr, 10) || 200, 1), 500);
      const all = await messageStoreRef.readHistory(histKey);
      const messages = all.length > limit ? all.slice(-limit) : all;
      jsonResponse(res, 200, { messages, total: all.length });
      return;
    }

    // Sessions
    case "/api/sessions": {
      const sessIp = getClientIp(req);
      if (!checkRateLimit(sessIp)) {
        jsonResponse(res, 429, { error: "too many requests" });
        return;
      }
      const sessAuth = authenticateRequest(req);
      if (sessAuth.kind === "invalid") {
        jsonResponse(res, 401, { error: "unauthorized" });
        return;
      }
      if (!messageStoreRef) {
        jsonResponse(res, 503, { error: "sessions unavailable" });
        return;
      }

      if (req.method === "GET") {
        const prefix = `web:${sessAuth.user.id}:`;
        const sessions = await messageStoreRef.listSessions(prefix);
        jsonResponse(res, 200, {
          sessions,
          isAdmin: sessAuth.kind === "admin",
        });
        return;
      }

      if (req.method === "DELETE") {
        const delSessionId = url.searchParams.get("sessionId") ?? "";
        if (!/^[\w\-]{1,64}$/.test(delSessionId)) {
          jsonResponse(res, 400, { error: "invalid sessionId" });
          return;
        }
        const delKey = `web:${sessAuth.user.id}:${delSessionId}`;
        const deleted = messageStoreRef.deleteSession(delKey);
        if (!deleted) {
          jsonResponse(res, 404, { error: "session not found" });
          return;
        }

        // Clean up Claude SDK session (in-memory + SessionStore)
        chatManagerRef?.reset(delKey).catch((err) => {
          console.error("[Web] Failed to reset Claude session:", delKey, err);
        });

        jsonResponse(res, 200, { deleted: true });
        return;
      }

      jsonResponse(res, 405, { error: "method not allowed" });
      return;
    }

    case "/api/health":
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    default:
      // File download: /api/files/<token>
      if (url.pathname.startsWith("/api/files/") && req.method === "GET") {
        return handleFileDownload(
          req,
          res,
          url.pathname.slice("/api/files/".length),
        );
      }
      // Avatar serving: /api/avatars/<filename>
      if (url.pathname.startsWith("/api/avatars/") && req.method === "GET") {
        const fileName = url.pathname.slice("/api/avatars/".length);
        return handleAvatarServe(req, res, fileName);
      }
      res.writeHead(404);
      res.end("not found");
  }
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

/**
 * Deliver a message proactively to a Web channel user via WebSocket.
 * `to` can be a userId or "*" to broadcast to all connected users.
 */
function deliverWebMessage(to: string, text: string): Promise<void> {
  const event: WsEvent = {
    type: "message",
    text,
    id: `cron-${Date.now().toString(36)}`,
  };

  if (to === "*") {
    for (const userId of wsClients.keys()) {
      sendWsEvent(userId, event);
    }
  } else if (wsClients.has(to)) {
    sendWsEvent(to, event);
  } else {
    console.warn(
      `[Web] deliver: user "${to}" has no active WebSocket connection, message dropped`,
    );
  }

  return Promise.resolve();
}

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
  deliver: deliverWebMessage,
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

    // WebSocket server (noServer mode — manual upgrade handling via cookie)
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://localhost:${cfg.port}`);
      if (url.pathname !== "/api/ws") {
        socket.destroy();
        return;
      }

      // Authenticate via cookie
      const auth = authenticateRequest(req);
      if (auth.kind === "invalid") {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, auth.user);
      });
    });

    wss.on(
      "connection",
      (rawWs: WebSocket, req: IncomingMessage, user: User) => {
        const ws = rawWs as KlausWebSocket;
        ws.isAlive = true;
        ws.klausUserId = user.id;
        ws.klausIp = getClientIp(req);

        addWsClient(user.id, ws);
        console.log(`[Web] WebSocket connected: ${userLabel(user)}`);

        ws.on("pong", () => {
          ws.isAlive = true;
        });

        ws.on("message", (raw: RawData) => {
          handleWsMessage(ws, raw, handler, cfg);
        });

        ws.on("close", () => {
          removeWsClient(user.id, ws);
          console.log(`[Web] WebSocket disconnected: ${userLabel(user)}`);
        });

        ws.on("error", (err) => {
          console.error(
            `[Web] WebSocket error (${userLabel(user)}):`,
            err.message,
          );
          removeWsClient(user.id, ws);
        });
      },
    );

    server.listen(cfg.port, "0.0.0.0", () => {
      console.log(
        `Klaus Web channel listening on http://localhost:${cfg.port}`,
      );
      console.log(`Login: http://localhost:${cfg.port}/login`);
      console.log(
        `Admin: http://localhost:${cfg.port}/admin (requires admin role)`,
      );
    });

    // Config file watcher
    let configWatcher: FSWatcher | null = null;
    let configDebounce: ReturnType<typeof setTimeout> | null = null;
    try {
      configWatcher = watch(CONFIG_FILE, () => {
        if (configDebounce) clearTimeout(configDebounce);
        configDebounce = setTimeout(() => {
          configDebounce = null;
          console.log("[Web] Config file changed, notifying clients");
          const data = JSON.stringify({ type: "config_updated" });
          for (const [, clients] of wsClients) {
            for (const ws of [...clients]) {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(data);
                } catch {
                  /* ignore */
                }
              }
            }
          }
        }, 500);
      });
    } catch {
      // config.yaml may not exist yet
    }

    // Application-layer ping — 25s keepalive
    const keepalive = setInterval(() => {
      for (const [userId, clients] of wsClients) {
        for (const ws of [...clients]) {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "ping" }));
            } catch {
              removeWsClient(userId, ws);
            }
          } else {
            removeWsClient(userId, ws);
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

    // Tunnel (Cloudflare / ngrok / custom)
    let tunnelResult: import("./web-tunnel.js").TunnelResult | null = null;
    if (cfg.tunnel !== false) {
      tunnelResult = startTunnel(cfg.tunnel, cfg.port);
    }

    // Cleanup on process exit
    const cleanup = (): void => {
      clearInterval(keepalive);
      clearInterval(deadCheck);
      if (configDebounce) clearTimeout(configDebounce);
      configWatcher?.close();
      wss.close();
      tunnelResult?.child?.kill();
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
