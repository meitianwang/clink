import * as p from "@clack/prompts";
import pc from "picocolors";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  CONFIG_FILE,
  loadConfig,
  saveConfig,
  addChannelToConfig,
  removeChannelFromConfig,
} from "./config.js";
import { setLang, t } from "./i18n.js";

function which(cmd: string): string | null {
  try {
    return execFileSync("which", [cmd], { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

async function checkPrerequisites(): Promise<boolean> {
  const [major] = process.versions.node.split(".").map(Number);
  const nodeOk = major >= 18;
  const claudeOk = which("claude") !== null;

  if (nodeOk) {
    p.log.success(t("node_ok", { version: process.version }));
  } else {
    p.log.error(t("node_need"));
  }

  if (claudeOk) {
    p.log.success(t("cli_ok"));
  } else {
    p.log.error(t("cli_not_found"));
  }

  return nodeOk && claudeOk;
}

function getInstallCommand(
  cmd: string,
): { bin: string; args: string[]; display: string } | null {
  if (process.platform === "darwin") {
    // brew install works for cloudflared, ngrok, frpc on macOS
    return {
      bin: "brew",
      args: ["install", cmd],
      display: `brew install ${cmd}`,
    };
  }
  if (process.platform === "linux" && cmd === "cloudflared") {
    return {
      bin: "sh",
      args: [
        "-c",
        "curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared",
      ],
      display: "curl + install cloudflared",
    };
  }
  if (process.platform === "linux" && cmd === "frpc") {
    // Install latest frpc binary for Linux amd64
    return {
      bin: "sh",
      args: [
        "-c",
        "set -e; V=$(curl -fsSL https://api.github.com/repos/fatedier/frp/releases/latest | grep tag_name | head -1 | sed 's/.*\"v\\(.*\\)\".*/\\1/'); " +
          'curl -fsSL "https://github.com/fatedier/frp/releases/download/v${V}/frp_${V}_linux_amd64.tar.gz" -o /tmp/frp.tar.gz && ' +
          "tar xzf /tmp/frp.tar.gz -C /tmp && " +
          "cp /tmp/frp_${V}_linux_amd64/frpc /usr/local/bin/frpc && chmod +x /usr/local/bin/frpc && " +
          "rm -rf /tmp/frp.tar.gz /tmp/frp_${V}_linux_amd64",
      ],
      display: "curl + install frpc from GitHub",
    };
  }
  return null;
}

async function ensureBinaryInstalled(
  cmd: string,
  installHint: string,
): Promise<void> {
  if (which(cmd) !== null) {
    p.log.success(t("web_binary_found", { cmd }));
    return;
  }
  p.log.warn(t("web_binary_not_found", { cmd }));
  p.log.info(installHint);

  const installCmd = getInstallCommand(cmd);
  if (installCmd) {
    const doInstall = await p.confirm({
      message: t("web_binary_auto_install", { cmd: installCmd.display }),
      initialValue: true,
    });
    if (!p.isCancel(doInstall) && doInstall) {
      p.log.info(t("web_binary_installing", { cmd }));
      try {
        execFileSync(installCmd.bin, installCmd.args, {
          stdio: "inherit",
          timeout: 300_000,
        });
        p.log.success(t("web_binary_install_ok", { cmd }));
      } catch {
        p.log.error(t("web_binary_install_fail", { cmd }));
      }
    }
  }
}

// Helper: required validator that allows empty when defaultValue exists
function requiredUnless(defaultVal: string | undefined) {
  return (v: string) => {
    if (v || defaultVal) return undefined;
    return t("validate_required");
  };
}

async function collectFrpConfig(
  prev: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  p.log.info(t("web_tunnel_frp_guide"));
  await ensureBinaryInstalled("frpc", t("web_frp_install_hint"));

  const prevProxyType = prev?.proxy_type
    ? String(prev.proxy_type)
    : undefined;
  const proxyType = await p.select({
    message: t("web_tunnel_frp_proxy_type"),
    initialValue: prevProxyType as "http" | "tcp" | undefined,
    options: [
      { value: "http" as const, label: t("web_tunnel_frp_proxy_http") },
      { value: "tcp" as const, label: t("web_tunnel_frp_proxy_tcp") },
    ],
  });
  if (p.isCancel(proxyType)) process.exit(0);

  const prevAddr = prev?.server_addr ? String(prev.server_addr) : "";
  const prevSPort = prev?.server_port ? String(prev.server_port) : "7000";
  const prevFrpToken = prev?.token ? String(prev.token) : "";

  const frpBase = await p.group({
    server_addr: () =>
      p.text({
        message: t("web_tunnel_frp_server_addr"),
        defaultValue: prevAddr || undefined,
        placeholder: prevAddr || undefined,
        validate: requiredUnless(prevAddr),
      }),
    server_port: () =>
      p.text({
        message: t("web_tunnel_frp_server_port"),
        defaultValue: prevSPort,
        placeholder: prevSPort,
      }),
    token: () =>
      p.text({
        message: t("web_tunnel_frp_token"),
        defaultValue: prevFrpToken || undefined,
        placeholder: prevFrpToken || undefined,
        validate: requiredUnless(prevFrpToken),
      }),
  });
  if (p.isCancel(frpBase)) process.exit(0);

  // CF CDN relay: route frpc control channel through Cloudflare for lower latency
  const prevCfRelay = prev?.transport_protocol === "websocket";
  const cfRelay = await p.confirm({
    message: t("web_tunnel_frp_cf_relay"),
    initialValue: prevCfRelay,
  });
  if (p.isCancel(cfRelay)) process.exit(0);

  let cfRelayDomain: string | undefined;
  if (cfRelay) {
    p.log.info(t("web_tunnel_frp_cf_relay_guide"));
    const prevCfDomain = prevCfRelay
      ? String(prev?.server_addr ?? "")
      : "";
    const domain = await p.text({
      message: t("web_tunnel_frp_cf_relay_domain"),
      defaultValue: prevCfDomain || undefined,
      placeholder: prevCfDomain || "frp.example.com",
      validate: requiredUnless(prevCfDomain),
    });
    if (p.isCancel(domain)) process.exit(0);
    cfRelayDomain = (domain as string) || prevCfDomain;
  }

  const frpCfg: Record<string, unknown> = {
    provider: "frp",
    server_addr:
      cfRelay && cfRelayDomain ? cfRelayDomain : frpBase.server_addr,
    server_port: cfRelay ? 80 : Number(frpBase.server_port) || 7000,
    token: frpBase.token,
    proxy_type: proxyType,
    ...(cfRelay ? { transport_protocol: "websocket" } : {}),
  };

  if (proxyType === "http") {
    const prevDomains = prev?.custom_domains as string[] | undefined;
    const prevDomain = prevDomains?.[0] ?? "";
    const domain = await p.text({
      message: t("web_tunnel_frp_custom_domain"),
      defaultValue: prevDomain || undefined,
      placeholder: prevDomain || undefined,
      validate: requiredUnless(prevDomain),
    });
    if (p.isCancel(domain)) process.exit(0);
    frpCfg.custom_domains = [domain as string];
  } else {
    const prevRemotePort = prev?.remote_port
      ? String(prev.remote_port)
      : "";
    const remotePort = await p.text({
      message: t("web_tunnel_frp_remote_port"),
      defaultValue: prevRemotePort || undefined,
      placeholder: prevRemotePort || undefined,
      validate: (v) => {
        if (!v && !prevRemotePort) return t("validate_required");
        const val = v || prevRemotePort;
        const n = Number(val);
        if (!Number.isFinite(n) || n < 1 || n > 65535) return "1-65535";
        return undefined;
      },
    });
    if (p.isCancel(remotePort)) process.exit(0);
    frpCfg.remote_port = Number(remotePort);
  }

  return frpCfg;
}

async function collectWebConfig(
  prev?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  p.log.info(t("web_guide"));

  const prevPort = prev?.port != null ? String(prev.port) : "3000";
  const prevTunnel =
    prev?.tunnel != null && typeof prev.tunnel === "object"
      ? (prev.tunnel as Record<string, unknown>)
      : null;
  const prevFrp =
    prevTunnel?.provider === "frp" ? prevTunnel : null;

  const basic = await p.group({
    port: () =>
      p.text({
        message: t("web_port"),
        defaultValue: prevPort,
        placeholder: prevPort,
      }),
  });
  if (p.isCancel(basic)) process.exit(0);

  const frpCfg = await collectFrpConfig(prevFrp);

  p.log.success(t("web_setup_done"));

  return {
    port: Number(basic.port) || 3000,
    tunnel: frpCfg,
  };
}

export async function runSetup(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(t("setup_title"))));

  // Step 1: Language
  const lang = await p.select({
    message: "Choose language / 选择语言",
    options: [
      { value: "en" as const, label: "English" },
      { value: "zh" as const, label: "中文" },
    ],
  });
  if (p.isCancel(lang)) process.exit(0);
  setLang(lang);

  // Step 2: Prerequisites
  const s = p.spinner();
  s.start(t("checking"));
  s.stop(t("checking"));
  const prereqOk = await checkPrerequisites();
  if (!prereqOk) {
    p.outro(t("checks_failed"));
    return;
  }

  // Step 3: Web channel config (port + frp tunnel)
  p.log.step(t("web_title"));

  let prevConfig: Record<string, unknown> | null = null;
  if (existsSync(CONFIG_FILE)) {
    try {
      prevConfig = loadConfig();
    } catch {
      p.log.warn(t("config_parse_error", { path: CONFIG_FILE }));
    }
  }
  const prevWeb = prevConfig?.web as Record<string, unknown> | undefined;
  const prevPort = prevWeb?.port != null ? String(prevWeb.port) : "3000";
  const prevTunnel =
    prevWeb?.tunnel != null && typeof prevWeb.tunnel === "object"
      ? (prevWeb.tunnel as Record<string, unknown>)
      : null;
  const prevFrp =
    prevTunnel?.provider === "frp" ? prevTunnel : null;

  const basic = await p.group({
    port: () =>
      p.text({
        message: t("web_port"),
        defaultValue: prevPort,
        placeholder: prevPort,
      }),
  });
  if (p.isCancel(basic)) process.exit(0);

  const frpCfg = await collectFrpConfig(prevFrp);

  p.log.success(t("web_setup_done"));

  // Step 4: Save
  const configData: Record<string, unknown> = {
    channel: "web",
    web: {
      port: Number(basic.port) || 3000,
      tunnel: frpCfg,
    },
  };

  saveConfig(configData);
  p.log.success(t("config_saved", { path: CONFIG_FILE }));
  p.outro(pc.green(t("setup_done")));
}

// ---------------------------------------------------------------------------
// Channel labels (shared by add/remove)
// ---------------------------------------------------------------------------

const ALL_CHANNELS = ["web"] as const;

function channelLabel(id: string): string {
  switch (id) {
    case "web":
      return `web — ${t("channel_web")}`;
    default:
      return id;
  }
}

// ---------------------------------------------------------------------------
// Collect & verify a single channel (extracted from runSetup loop)
// ---------------------------------------------------------------------------

async function collectAndVerifyChannel(
  channel: string,
  prev?: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (channel === "web") {
    p.log.step(t("web_title"));
    return collectWebConfig(prev);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Add Channel
// ---------------------------------------------------------------------------

async function selectLang(): Promise<void> {
  const lang = await p.select({
    message: "Choose language / 选择语言",
    options: [
      { value: "en" as const, label: "English" },
      { value: "zh" as const, label: "中文" },
    ],
  });
  if (p.isCancel(lang)) process.exit(0);
  setLang(String(lang) as "en" | "zh");
}

export async function runAddChannel(): Promise<void> {
  if (!existsSync(CONFIG_FILE)) {
    console.log(t("add_channel_no_config"));
    return;
  }

  p.intro(pc.bgCyan(pc.black(t("add_channel_title"))));
  await selectLang();

  const cfg = loadConfig();
  const raw = cfg.channel;
  const configured: string[] = Array.isArray(raw)
    ? raw.map(String)
    : raw
      ? [String(raw)]
      : [];

  const available = ALL_CHANNELS.filter((c) => !configured.includes(c));
  if (available.length === 0) {
    p.log.warn(t("add_channel_none"));
    p.outro("");
    return;
  }

  const selected = await p.select({
    message: t("add_channel_select"),
    options: available.map((c) => ({ value: c, label: channelLabel(c) })),
  });
  if (p.isCancel(selected)) process.exit(0);

  const channelId = String(selected);
  const channelCfg = await collectAndVerifyChannel(channelId);
  if (!channelCfg) {
    p.outro(t("setup_cancelled"));
    return;
  }

  addChannelToConfig(channelId, channelCfg);
  p.log.success(t("add_channel_success", { channel: channelId }));
  p.outro(pc.green(t("config_saved", { path: CONFIG_FILE })));
}

// ---------------------------------------------------------------------------
// Remove Channel
// ---------------------------------------------------------------------------

export async function runRemoveChannel(): Promise<void> {
  if (!existsSync(CONFIG_FILE)) {
    console.log(t("add_channel_no_config"));
    return;
  }

  p.intro(pc.bgCyan(pc.black(t("remove_channel_title"))));
  await selectLang();

  const cfg = loadConfig();
  const raw = cfg.channel;
  const configured: string[] = Array.isArray(raw)
    ? raw.map(String)
    : raw
      ? [String(raw)]
      : [];

  if (configured.length === 0) {
    p.log.warn(t("remove_channel_none"));
    p.outro("");
    return;
  }

  if (configured.length === 1) {
    p.log.warn(t("remove_channel_last"));
    p.outro("");
    return;
  }

  const selected = await p.select({
    message: t("remove_channel_select"),
    options: configured.map((c) => ({ value: c, label: channelLabel(c) })),
  });
  if (p.isCancel(selected)) process.exit(0);

  const channelId = String(selected);
  const confirmed = await p.confirm({
    message: t("remove_channel_confirm", { channel: channelId }),
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.outro(t("setup_cancelled"));
    return;
  }

  removeChannelFromConfig(channelId);
  p.log.success(t("remove_channel_success", { channel: channelId }));
  p.outro(pc.green(t("config_saved", { path: CONFIG_FILE })));
}
