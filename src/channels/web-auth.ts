/**
 * Authentication route handlers for the web channel.
 *
 * Routes:
 *   POST /api/auth/register  — email + password + invite code
 *   POST /api/auth/login     — email + password
 *   POST /api/auth/logout    — clear session
 *   GET  /api/auth/me        — current user info
 *   GET  /api/auth/google    — redirect to Google OAuth
 *   GET  /api/auth/google/callback — Google OAuth callback
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { UserStore } from "../user-store.js";
import type { InviteStore } from "../invite-store.js";
import type { WebConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

const COOKIE_NAME = "klaus_session";
const OAUTH_STATE_COOKIE = "klaus_oauth_state";

export function parseCookies(
  header: string | undefined,
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  }
  return cookies;
}

export function getSessionToken(req: IncomingMessage): string {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] ?? "";
}

function setSessionCookie(
  res: ServerResponse,
  token: string,
  maxAgeDays: number,
  isSecure: boolean,
): void {
  const maxAge = Math.floor(maxAgeDays * 24 * 60 * 60);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    "Path=/",
  ];
  if (isSecure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`,
  );
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage, maxSize = 4096): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
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

function json(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function getClientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

function isSecureRequest(req: IncomingMessage): boolean {
  return (
    req.headers["x-forwarded-proto"] === "https" ||
    (req.socket as { encrypted?: boolean }).encrypted === true
  );
}

function getOrigin(req: IncomingMessage): string {
  const proto = isSecureRequest(req) ? "https" : "http";
  const host = req.headers.host ?? `localhost`;
  return `${proto}://${host}`;
}

function userResponse(user: {
  id: string;
  email: string;
  displayName: string;
  role: string;
}): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function handleAuthRegister(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WebConfig,
  userStore: UserStore,
  inviteStore: InviteStore,
): Promise<void> {
  if (req.method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  let body: Record<string, unknown>;
  try {
    const buf = await readBody(req);
    body = JSON.parse(buf.toString()) as Record<string, unknown>;
  } catch {
    json(res, 400, { error: "invalid JSON" });
    return;
  }

  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim();
  const inviteCode = String(body.inviteCode ?? "").trim();

  // Validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    json(res, 400, { error: "invalid_email" });
    return;
  }
  if (password.length < 8) {
    json(res, 400, { error: "password_too_short" });
    return;
  }
  if (!displayName) {
    json(res, 400, { error: "display_name_required" });
    return;
  }

  // First user can register without invite code (becomes admin)
  const isFirstUser = userStore.isFirstUser();
  if (!isFirstUser) {
    if (!inviteCode) {
      json(res, 400, { error: "invite_code_required" });
      return;
    }

    // Validate invite code
    if (!inviteStore.isValid(inviteCode)) {
      json(res, 400, { error: "invalid_invite_code" });
      return;
    }
  }

  // Check if email already registered
  if (userStore.getUserByEmail(email)) {
    json(res, 409, { error: "email_already_registered" });
    return;
  }

  try {
    const user = await userStore.register(
      email,
      password,
      displayName,
      inviteCode,
    );

    // Consume the invite code (one-time use)
    if (!isFirstUser && inviteCode) {
      inviteStore.consume(inviteCode, email);
    }

    const session = userStore.createSession(
      user.id,
      getClientIp(req),
      req.headers["user-agent"] ?? "",
    );

    setSessionCookie(
      res,
      session.token,
      cfg.sessionMaxAgeDays,
      isSecureRequest(req),
    );
    console.log(`[Web] User registered: ${user.id.slice(0, 8)} (${user.role})`);
    json(res, 201, { user: userResponse(user) });
  } catch (err) {
    console.error("[Web] Registration error:", err);
    json(res, 500, { error: "registration_failed" });
  }
}

export async function handleAuthLogin(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WebConfig,
  userStore: UserStore,
): Promise<void> {
  if (req.method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  let body: Record<string, unknown>;
  try {
    const buf = await readBody(req);
    body = JSON.parse(buf.toString()) as Record<string, unknown>;
  } catch {
    json(res, 400, { error: "invalid JSON" });
    return;
  }

  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    json(res, 400, { error: "email_and_password_required" });
    return;
  }

  const user = await userStore.verifyLogin(email, password);
  if (!user) {
    json(res, 401, { error: "invalid_credentials" });
    return;
  }

  const session = userStore.createSession(
    user.id,
    getClientIp(req),
    req.headers["user-agent"] ?? "",
  );

  setSessionCookie(
    res,
    session.token,
    cfg.sessionMaxAgeDays,
    isSecureRequest(req),
  );
  console.log(`[Web] User logged in: ${user.id.slice(0, 8)}`);
  json(res, 200, { user: userResponse(user) });
}

export function handleAuthLogout(
  req: IncomingMessage,
  res: ServerResponse,
  userStore: UserStore,
): void {
  if (req.method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  const token = getSessionToken(req);
  if (token) {
    userStore.revokeSession(token);
  }

  clearSessionCookie(res);
  json(res, 200, { ok: true });
}

export function handleAuthMe(
  req: IncomingMessage,
  res: ServerResponse,
  userStore: UserStore,
  cfg: WebConfig,
): void {
  if (req.method !== "GET") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  const token = getSessionToken(req);
  const auth = userStore.validateSession(token);
  if (!auth) {
    json(res, 401, { error: "not_authenticated" });
    return;
  }

  json(res, 200, {
    user: userResponse(auth.user),
    hasGoogle: !!cfg.google,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/auth/profile — Update current user's display name
// ---------------------------------------------------------------------------

export async function handleAuthProfile(
  req: IncomingMessage,
  res: ServerResponse,
  userStore: UserStore,
): Promise<void> {
  if (req.method !== "PATCH") {
    json(res, 405, { error: "method not allowed" });
    return;
  }

  const token = getSessionToken(req);
  const auth = userStore.validateSession(token);
  if (!auth) {
    json(res, 401, { error: "not_authenticated" });
    return;
  }

  const body = await readBody(req, 1024);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body.toString()) as Record<string, unknown>;
  } catch {
    json(res, 400, { error: "invalid JSON" });
    return;
  }

  const displayName = String(parsed.displayName ?? "").trim();
  if (!displayName) {
    json(res, 400, { error: "display_name_required" });
    return;
  }
  if (displayName.length > 50) {
    json(res, 400, { error: "display_name_too_long" });
    return;
  }

  userStore.setDisplayName(auth.user.id, displayName);
  const updated = userStore.getUserById(auth.user.id);
  if (!updated) {
    json(res, 500, { error: "update_failed" });
    return;
  }

  json(res, 200, { user: userResponse(updated) });
}

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export function handleGoogleRedirect(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WebConfig,
): void {
  if (!cfg.google) {
    json(res, 404, { error: "google_oauth_not_configured" });
    return;
  }

  const url = new URL(req.url ?? "/", getOrigin(req));
  const inviteCode = url.searchParams.get("invite") ?? "";

  // CSRF protection: random nonce stored in HttpOnly cookie, verified on callback
  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}:${inviteCode}`;
  const secure = isSecureRequest(req);
  const stateCookie = [
    `${OAUTH_STATE_COOKIE}=${nonce}`,
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600", // 10 minutes
    "Path=/api/auth/google",
    ...(secure ? ["Secure"] : []),
  ].join("; ");

  const redirectUri = `${getOrigin(req)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: cfg.google.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    state,
  });

  res.writeHead(302, {
    Location: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    "Set-Cookie": stateCookie,
  });
  res.end();
}

export async function handleGoogleCallback(
  req: IncomingMessage,
  res: ServerResponse,
  cfg: WebConfig,
  userStore: UserStore,
  inviteStore: InviteStore,
): Promise<void> {
  if (!cfg.google) {
    json(res, 404, { error: "google_oauth_not_configured" });
    return;
  }

  const url = new URL(req.url ?? "/", getOrigin(req));
  const code = url.searchParams.get("code") ?? "";
  const rawState = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");

  // CSRF: validate state nonce against cookie
  const cookies = parseCookies(req.headers.cookie);
  const expectedNonce = cookies[OAUTH_STATE_COOKIE] ?? "";
  const colonIdx = rawState.indexOf(":");
  const stateNonce = colonIdx >= 0 ? rawState.slice(0, colonIdx) : rawState;
  const inviteCode = colonIdx >= 0 ? rawState.slice(colonIdx + 1) : "";

  // Clear the state cookie
  const clearStateCookie = `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/api/auth/google`;

  if (!expectedNonce || stateNonce !== expectedNonce) {
    res.writeHead(302, {
      Location: "/login?error=google_failed",
      "Set-Cookie": clearStateCookie,
    });
    res.end();
    return;
  }

  if (error) {
    res.writeHead(302, {
      Location: "/login?error=google_denied",
      "Set-Cookie": clearStateCookie,
    });
    res.end();
    return;
  }

  if (!code) {
    res.writeHead(302, {
      Location: "/login?error=google_no_code",
      "Set-Cookie": clearStateCookie,
    });
    res.end();
    return;
  }

  try {
    // Exchange code for tokens
    const redirectUri = `${getOrigin(req)}/api/auth/google/callback`;
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.google.clientId,
        client_secret: cfg.google.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      console.error(
        "[Web] Google token exchange failed:",
        await tokenResp.text(),
      );
      res.writeHead(302, { Location: "/login?error=google_token_failed" });
      res.end();
      return;
    }

    const tokens = (await tokenResp.json()) as {
      access_token: string;
      id_token?: string;
    };

    // Get user info
    const userInfoResp = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResp.ok) {
      res.writeHead(302, { Location: "/login?error=google_userinfo_failed" });
      res.end();
      return;
    }

    const googleUser = (await userInfoResp.json()) as {
      sub: string;
      email: string;
      name: string;
    };

    // Find or create user — first user skips invite code requirement
    const isFirstUser = userStore.isFirstUser();
    let inviteForCreate: string | undefined;
    if (!isFirstUser && inviteCode && inviteStore.isValid(inviteCode)) {
      inviteForCreate = inviteCode;
    }

    let result: {
      user: { id: string; email: string; displayName: string; role: string };
      isNew: boolean;
    };
    try {
      result = await userStore.findOrCreateByGoogle(
        googleUser.sub,
        googleUser.email,
        googleUser.name,
        inviteForCreate,
      );
    } catch (err) {
      if (err instanceof Error && err.message === "invite_code_required") {
        res.writeHead(302, {
          Location: "/login?error=invite_required&mode=register",
          "Set-Cookie": clearStateCookie,
        });
        res.end();
        return;
      }
      throw err;
    }

    // Consume the invite code if a new user was created
    if (result.isNew && inviteForCreate) {
      inviteStore.consume(inviteForCreate, googleUser.email);
    }

    const session = userStore.createSession(
      result.user.id,
      getClientIp(req),
      req.headers["user-agent"] ?? "",
    );

    setSessionCookie(
      res,
      session.token,
      cfg.sessionMaxAgeDays,
      isSecureRequest(req),
    );
    // Also clear the OAuth state cookie (append to existing Set-Cookie)
    const existing = res.getHeader("Set-Cookie");
    const cookieArr = Array.isArray(existing)
      ? existing
      : existing
        ? [String(existing)]
        : [];
    cookieArr.push(clearStateCookie);
    res.setHeader("Set-Cookie", cookieArr);

    console.log(
      `[Web] Google login: ${result.user.id.slice(0, 8)} (${result.isNew ? "new" : "existing"})`,
    );
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (err) {
    console.error("[Web] Google OAuth error:", err);
    res.writeHead(302, {
      Location: "/login?error=google_failed",
      "Set-Cookie": clearStateCookie,
    });
    res.end();
  }
}
