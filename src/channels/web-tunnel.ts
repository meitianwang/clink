/**
 * Tunnel provider system for the web channel.
 * Supports: Cloudflare Quick Tunnel, Cloudflare Named Tunnel, ngrok, Custom.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, chmodSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  TunnelConfig,
  NamedTunnelConfig,
  NgrokTunnelConfig,
  CustomTunnelConfig,
  FrpTunnelConfig,
} from "../types.js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface TunnelResult {
  readonly child: ChildProcess | null;
  readonly publicUrl: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasCommand(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function logMissing(cmd: string, installHint: string): void {
  console.warn(
    `[Web] ${cmd} not found. Install it:\n${installHint}\n\nContinuing with localhost only.`,
  );
}

// ---------------------------------------------------------------------------
// Provider: Cloudflare Quick Tunnel (random URL, no account)
// ---------------------------------------------------------------------------

function startQuickTunnel(port: number): TunnelResult | null {
  if (!hasCommand("cloudflared")) {
    logMissing(
      "cloudflared",
      "  macOS: brew install cloudflared\n" +
        "  Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    );
    return null;
  }

  console.log("[Web] Starting Cloudflare Quick Tunnel...");

  const child = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://localhost:${port}`],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let urlFound = false;
  const onData = (chunk: Buffer): void => {
    const text = chunk.toString();
    if (!urlFound) {
      const match = text.match(
        /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/,
      );
      if (match) {
        urlFound = true;
        console.log(`[Web] Tunnel URL: ${match[0]}`);
      }
    }
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.warn(`[Web] Cloudflare Quick Tunnel exited with code ${code}`);
    }
  });

  return { child, publicUrl: null };
}

// ---------------------------------------------------------------------------
// Provider: Cloudflare Named Tunnel (fixed hostname, requires token)
// ---------------------------------------------------------------------------

function startNamedTunnel(
  cfg: NamedTunnelConfig,
  _port: number,
): TunnelResult | null {
  if (!hasCommand("cloudflared")) {
    logMissing(
      "cloudflared",
      "  macOS: brew install cloudflared\n" +
        "  Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    );
    return null;
  }

  const displayHost = cfg.hostname ?? "(configured in CF dashboard)";
  console.log(`[Web] Starting Cloudflare Named Tunnel → ${displayHost}`);

  const child = spawn("cloudflared", ["tunnel", "run", "--token", cfg.token], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) console.log(`[Web][cloudflared] ${text}`);
  });

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.warn(`[Web] Cloudflare Named Tunnel exited with code ${code}`);
    }
  });

  const publicUrl = cfg.hostname ? `https://${cfg.hostname}` : null;
  return { child, publicUrl };
}

// ---------------------------------------------------------------------------
// Provider: ngrok
// ---------------------------------------------------------------------------

function startNgrokTunnel(
  cfg: NgrokTunnelConfig,
  port: number,
): TunnelResult | null {
  if (!hasCommand("ngrok")) {
    logMissing(
      "ngrok",
      "  macOS: brew install ngrok\n  Other: https://ngrok.com/download",
    );
    return null;
  }

  const args = ["http", String(port), "--authtoken", cfg.authtoken];
  if (cfg.domain) {
    args.push("--domain", cfg.domain);
  }

  const displayDomain = cfg.domain ?? "(random ngrok URL)";
  console.log(`[Web] Starting ngrok tunnel → ${displayDomain}`);

  const child = spawn("ngrok", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let urlFound = Boolean(cfg.domain);
  const onData = (chunk: Buffer): void => {
    const text = chunk.toString();
    if (!urlFound) {
      const match = text.match(/https:\/\/[a-z0-9-]+\.ngrok[a-z-]*\.\w+/);
      if (match) {
        urlFound = true;
        console.log(`[Web] Tunnel URL: ${match[0]}`);
      }
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.warn(`[Web] ngrok exited with code ${code}`);
    }
  });

  const publicUrl = cfg.domain ? `https://${cfg.domain}` : null;
  return { child, publicUrl };
}

// ---------------------------------------------------------------------------
// Provider: Custom
// ---------------------------------------------------------------------------

function startCustomTunnel(cfg: CustomTunnelConfig): TunnelResult | null {
  console.log(`[Web] Custom tunnel URL: ${cfg.url}`);

  if (!cfg.command) {
    return { child: null, publicUrl: cfg.url };
  }

  const parts = cfg.command.split(/\s+/).filter(Boolean);
  const bin = parts[0];

  if (!hasCommand(bin)) {
    console.warn(
      `[Web] Custom tunnel command "${bin}" not found. Continuing without tunnel process.`,
    );
    return { child: null, publicUrl: cfg.url };
  }

  console.log(`[Web] Starting custom tunnel command: ${cfg.command}`);

  const child = spawn(bin, parts.slice(1), {
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.on("error", (err) => {
    console.warn(`[Web] Custom tunnel command failed: ${err.message}`);
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    console.log(`[Web][tunnel] ${chunk.toString().trim()}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    console.warn(`[Web][tunnel] ${chunk.toString().trim()}`);
  });

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.warn(`[Web] Custom tunnel command exited with code ${code}`);
    }
  });

  return { child, publicUrl: cfg.url };
}

// ---------------------------------------------------------------------------
// Provider: frp (Fast Reverse Proxy)
// ---------------------------------------------------------------------------

/** Escape a string for safe inclusion in a TOML double-quoted value. */
function escapeTOML(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function generateFrpcToml(cfg: FrpTunnelConfig, port: number): string {
  const proxyType = cfg.proxy_type ?? "http";
  const proxyName = cfg.proxy_name ?? "klaus-web";

  const lines: string[] = [
    `serverAddr = "${escapeTOML(cfg.server_addr)}"`,
    `serverPort = ${cfg.server_port}`,
    "",
    "[auth]",
    `token = "${escapeTOML(cfg.token)}"`,
  ];

  // Transport optimizations: connection pool + keep-alive reduce latency
  // Use "websocket" protocol when routing through CF CDN for ~10x lower latency
  const transportProto = cfg.transport_protocol ?? "tcp";
  lines.push(
    "",
    "[transport]",
    "poolCount = 5",
    `protocol = "${transportProto}"`,
    `tls.enable = ${cfg.tls_enable ? "true" : "false"}`,
  );

  lines.push(
    "",
    "[[proxies]]",
    `name = "${escapeTOML(proxyName)}"`,
    `type = "${proxyType}"`,
    `localIP = "127.0.0.1"`,
    `localPort = ${port}`,
    `transport.useEncryption = true`,
    `transport.useCompression = true`,
  );

  if (proxyType === "http" && cfg.custom_domains?.length) {
    const domains = cfg.custom_domains
      .map((d) => `"${escapeTOML(d)}"`)
      .join(", ");
    lines.push(`customDomains = [${domains}]`);
  }

  if (proxyType === "tcp" && cfg.remote_port != null) {
    lines.push(`remotePort = ${cfg.remote_port}`);
  }

  return lines.join("\n") + "\n";
}

function startFrpTunnel(
  cfg: FrpTunnelConfig,
  port: number,
): TunnelResult | null {
  if (!hasCommand("frpc")) {
    logMissing(
      "frpc",
      "  Download: https://github.com/fatedier/frp/releases\n" +
        "  macOS: brew install frpc",
    );
    return null;
  }

  if (!cfg.server_addr || !cfg.token) {
    console.warn("[Web] frp tunnel requires server_addr and token.");
    return null;
  }

  const proxyType = cfg.proxy_type ?? "http";
  if (proxyType === "tcp" && cfg.remote_port == null) {
    console.warn(
      "[Web] frp TCP mode requires remote_port. Continuing without tunnel.",
    );
    return null;
  }

  // Generate temporary frpc.toml (restricted permissions — contains token)
  const tmpDir = mkdtempSync(join(tmpdir(), "klaus-frp-"));
  const configPath = join(tmpDir, "frpc.toml");
  writeFileSync(configPath, generateFrpcToml(cfg, port), {
    encoding: "utf-8",
    mode: 0o600,
  });

  const displayTarget =
    proxyType === "http" && cfg.custom_domains?.length
      ? cfg.custom_domains[0]
      : `${cfg.server_addr}:${cfg.remote_port ?? cfg.server_port}`;
  console.log(`[Web] Starting frp tunnel → ${displayTarget}`);

  const child = spawn("frpc", ["-c", configPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let ready = false;
  const onData = (chunk: Buffer): void => {
    const text = chunk.toString();
    if (!ready && /proxy.*start|login.*server.*success/i.test(text)) {
      ready = true;
      console.log("[Web] frp tunnel ready");
    }
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  const cleanup = (): void => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  };

  child.on("exit", (code) => {
    cleanup();
    if (code !== null && code !== 0) {
      console.warn(`[Web] frpc exited with code ${code}`);
    }
  });

  // Compute publicUrl
  let publicUrl: string | null = null;
  if (proxyType === "http" && cfg.custom_domains?.length) {
    publicUrl = `http://${cfg.custom_domains[0]}`;
  } else if (proxyType === "tcp" && cfg.remote_port != null) {
    publicUrl = `http://${cfg.server_addr}:${cfg.remote_port}`;
  }

  return { child, publicUrl };
}

// ---------------------------------------------------------------------------
// Unified dispatcher
// ---------------------------------------------------------------------------

export function startTunnel(
  tunnelCfg: TunnelConfig,
  port: number,
): TunnelResult | null {
  switch (tunnelCfg.provider) {
    case "cloudflare-quick":
      return startQuickTunnel(port);
    case "cloudflare":
      return startNamedTunnel(tunnelCfg, port);
    case "ngrok":
      return startNgrokTunnel(tunnelCfg, port);
    case "custom":
      return startCustomTunnel(tunnelCfg);
    case "frp":
      return startFrpTunnel(tunnelCfg, port);
  }
}
