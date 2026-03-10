import * as p from "@clack/prompts";
import pc from "picocolors";
import { execSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

async function collectWebConfig(
  prev?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  p.log.info(t("web_guide"));

  const prevPort = prev?.port != null ? String(prev.port) : "3000";

  // Basic config: port only (auth is now user-based with invite codes)
  const basic = await p.group({
    port: () =>
      p.text({
        message: t("web_port"),
        defaultValue: prevPort,
        placeholder: prevPort,
      }),
  });
  if (p.isCancel(basic)) process.exit(0);

  // Tunnel mode selection
  const tunnelMode = await p.select({
    message: t("web_tunnel_mode"),
    options: [
      { value: "none" as const, label: t("web_tunnel_none") },
      { value: "cloudflare-quick" as const, label: t("web_tunnel_quick") },
      { value: "cloudflare" as const, label: t("web_tunnel_named") },
      { value: "ngrok" as const, label: t("web_tunnel_ngrok") },
      { value: "frp" as const, label: t("web_tunnel_frp") },
      { value: "custom" as const, label: t("web_tunnel_custom") },
    ],
  });
  if (p.isCancel(tunnelMode)) process.exit(0);

  let tunnelCfg: Record<string, unknown> | boolean = false;

  if (tunnelMode === "cloudflare-quick") {
    tunnelCfg = true; // backward compat: writes `tunnel: true`
    await ensureBinaryInstalled("cloudflared", t("web_cf_install_hint"));
  } else if (tunnelMode === "cloudflare") {
    p.log.info(t("web_tunnel_named_guide"));
    await ensureBinaryInstalled("cloudflared", t("web_cf_install_hint"));
    const named = await p.group({
      token: () =>
        p.text({
          message: t("web_tunnel_cf_token"),
          validate: (v) => (v ? undefined : t("validate_required")),
        }),
      hostname: () =>
        p.text({
          message: t("web_tunnel_cf_hostname"),
          placeholder: "chat.example.com",
          defaultValue: "",
        }),
    });
    if (p.isCancel(named)) process.exit(0);
    tunnelCfg = {
      provider: "cloudflare",
      token: named.token,
      ...(named.hostname ? { hostname: named.hostname } : {}),
    };
  } else if (tunnelMode === "ngrok") {
    p.log.info(t("web_tunnel_ngrok_guide"));
    await ensureBinaryInstalled("ngrok", t("web_ngrok_install_hint"));
    const ngrok = await p.group({
      authtoken: () =>
        p.text({
          message: t("web_tunnel_ngrok_authtoken"),
          validate: (v) => (v ? undefined : t("validate_required")),
        }),
      domain: () =>
        p.text({
          message: t("web_tunnel_ngrok_domain"),
          placeholder: "my-app.ngrok-free.app",
          defaultValue: "",
        }),
    });
    if (p.isCancel(ngrok)) process.exit(0);
    tunnelCfg = {
      provider: "ngrok",
      authtoken: ngrok.authtoken,
      ...(ngrok.domain ? { domain: ngrok.domain } : {}),
    };
  } else if (tunnelMode === "frp") {
    p.log.info(t("web_tunnel_frp_guide"));
    await ensureBinaryInstalled("frpc", t("web_frp_install_hint"));
    const proxyType = await p.select({
      message: t("web_tunnel_frp_proxy_type"),
      options: [
        { value: "http" as const, label: t("web_tunnel_frp_proxy_http") },
        { value: "tcp" as const, label: t("web_tunnel_frp_proxy_tcp") },
      ],
    });
    if (p.isCancel(proxyType)) process.exit(0);

    const frpBase = await p.group({
      server_addr: () =>
        p.text({
          message: t("web_tunnel_frp_server_addr"),
          validate: (v) => (v ? undefined : t("validate_required")),
        }),
      server_port: () =>
        p.text({
          message: t("web_tunnel_frp_server_port"),
          defaultValue: "7000",
          placeholder: "7000",
        }),
      token: () =>
        p.text({
          message: t("web_tunnel_frp_token"),
          validate: (v) => (v ? undefined : t("validate_required")),
        }),
    });
    if (p.isCancel(frpBase)) process.exit(0);

    const frpCfg: Record<string, unknown> = {
      provider: "frp",
      server_addr: frpBase.server_addr,
      server_port: Number(frpBase.server_port) || 7000,
      token: frpBase.token,
      proxy_type: proxyType,
    };

    if (proxyType === "http") {
      const domain = await p.text({
        message: t("web_tunnel_frp_custom_domain"),
        validate: (v) => (v ? undefined : t("validate_required")),
      });
      if (p.isCancel(domain)) process.exit(0);
      frpCfg.custom_domains = [domain as string];
    } else {
      const remotePort = await p.text({
        message: t("web_tunnel_frp_remote_port"),
        validate: (v) => {
          if (!v) return t("validate_required");
          const n = Number(v);
          if (!Number.isFinite(n) || n < 1 || n > 65535) return "1-65535";
          return undefined;
        },
      });
      if (p.isCancel(remotePort)) process.exit(0);
      frpCfg.remote_port = Number(remotePort);
    }

    tunnelCfg = frpCfg;
  } else if (tunnelMode === "custom") {
    p.log.info(t("web_tunnel_custom_guide"));
    const custom = await p.group({
      url: () =>
        p.text({
          message: t("web_tunnel_custom_url"),
          validate: (v) => {
            if (!v) return t("validate_required");
            try {
              const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
              new URL(normalized);
              return undefined;
            } catch {
              return t("validate_invalid_url");
            }
          },
        }),
      command: () =>
        p.text({
          message: t("web_tunnel_custom_command"),
          placeholder: "frpc -c /path/to/frpc.ini",
          defaultValue: "",
        }),
    });
    if (p.isCancel(custom)) process.exit(0);
    const customUrl = /^https?:\/\//i.test(custom.url as string)
      ? (custom.url as string)
      : `https://${custom.url as string}`;
    tunnelCfg = {
      provider: "custom",
      url: customUrl,
      ...(custom.command ? { command: custom.command } : {}),
    };
  }

  p.log.success(t("web_setup_done"));

  return {
    port: Number(basic.port) || 3000,
    tunnel: tunnelCfg,
  };
}

export async function runSetup(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(t("setup_title"))));

  // Step 0: Language
  const lang = await p.select({
    message: "Choose language / 选择语言",
    options: [
      { value: "en" as const, label: "English" },
      { value: "zh" as const, label: "中文" },
    ],
  });
  if (p.isCancel(lang)) process.exit(0);
  setLang(lang);

  // Check existing config
  let prevConfig: Record<string, unknown> | null = null;
  if (existsSync(CONFIG_FILE)) {
    const existing = loadConfig();
    const rawCh = existing.channel;
    const chDisplay = Array.isArray(rawCh)
      ? rawCh.join(", ")
      : String(rawCh ?? "unknown");
    p.log.warn(t("config_exists", { path: CONFIG_FILE, channel: chDisplay }));

    const action = await p.select({
      message: t("config_action"),
      options: [
        {
          value: "reconfigure" as const,
          label: t("config_action_reconfigure"),
        },
        { value: "overwrite" as const, label: t("config_action_overwrite") },
        { value: "cancel" as const, label: t("config_action_cancel") },
      ],
    });
    if (p.isCancel(action) || action === "cancel") {
      p.outro(t("setup_cancelled"));
      return;
    }
    if (action === "reconfigure") {
      prevConfig = existing;
    }
  }

  // Step 1: Prerequisites
  const s = p.spinner();
  s.start(t("checking"));
  s.stop(t("checking"));
  const prereqOk = await checkPrerequisites();
  if (!prereqOk) {
    p.outro(t("checks_failed"));
    return;
  }

  // Step 2: Choose channel(s)
  const prevChannelRaw = prevConfig?.channel;
  const prevChannels: string[] = Array.isArray(prevChannelRaw)
    ? prevChannelRaw.map(String)
    : typeof prevChannelRaw === "string"
      ? [prevChannelRaw]
      : [];

  p.log.info(t("choose_channel_hint"));
  const channels = await p.multiselect({
    message: t("choose_channel"),
    options: [
      {
        value: "web" as const,
        label: `web — ${t("channel_web")}`,
      },
    ],
    initialValues: prevChannels as "web"[],
    required: true,
  });
  if (p.isCancel(channels)) process.exit(0);

  // Step 3: Collect channel config & install deps for each selected channel
  const channelConfigs: Record<string, Record<string, unknown>> = {};

  for (const channel of channels) {
    if (channel === "web") {
      p.log.step(t("web_title"));
      const prevWeb = prevConfig?.web as Record<string, unknown> | undefined;
      channelConfigs.web = await collectWebConfig(prevWeb);
    }
  }

  // Step 4: Bot persona
  p.log.step(t("persona_title"));
  const prevPersona = (prevConfig?.persona as string) ?? "";
  const personaOptions: { value: string; label: string }[] = [];
  if (prevPersona) {
    personaOptions.push({ value: "keep", label: t("persona_keep") });
  }
  personaOptions.push(
    { value: "clipboard", label: t("persona_from_clipboard") },
    { value: "file", label: t("persona_from_file") },
    { value: "text", label: t("persona_direct") },
    { value: "skip", label: t("persona_skip_option") },
  );
  const personaMethod = await p.select({
    message: t("persona_method"),
    options: personaOptions,
  });
  if (p.isCancel(personaMethod)) process.exit(0);

  let persona = personaMethod === "keep" ? prevPersona : "";
  if (personaMethod === "clipboard") {
    // Read from system clipboard
    const clipCmd =
      process.platform === "darwin"
        ? "pbpaste"
        : process.platform === "win32"
          ? 'powershell -command "Get-Clipboard"'
          : "xclip -selection clipboard -o";
    try {
      persona = execSync(clipCmd, { encoding: "utf-8" }).trim();
    } catch {
      persona = "";
    }
    if (persona) {
      const preview =
        persona.length > 200 ? persona.slice(0, 200) + "..." : persona;
      p.log.info(t("persona_clipboard_preview") + "\n\n" + preview);
      const ok = await p.confirm({ message: t("persona_clipboard_confirm") });
      if (p.isCancel(ok)) process.exit(0);
      if (!ok) {
        persona = "";
        p.log.warn(t("persona_skipped"));
      } else {
        p.log.success(
          t("persona_saved") +
            ` (${persona.split("\n").length} ${t("persona_lines")})`,
        );
      }
    } else {
      p.log.warn(t("persona_clipboard_empty"));
    }
  } else if (personaMethod === "file") {
    const filePath = await p.text({
      message: t("persona_file_prompt"),
      placeholder: "~/persona.md",
      validate: (v) => {
        if (!v) return t("persona_file_required");
        const resolved = v.startsWith("~")
          ? v.replace("~", process.env.HOME ?? "")
          : v;
        if (!existsSync(resolved)) return t("persona_file_not_found");
        return undefined;
      },
    });
    if (p.isCancel(filePath)) process.exit(0);
    const resolved = (filePath as string).startsWith("~")
      ? (filePath as string).replace("~", process.env.HOME ?? "")
      : (filePath as string);
    persona = readFileSync(resolved, "utf-8").trim();
    p.log.success(
      t("persona_saved") +
        ` (${persona.split("\n").length} ${t("persona_lines")})`,
    );
  } else if (personaMethod === "text") {
    const text = await p.text({
      message: t("persona_prompt"),
      placeholder: t("persona_placeholder"),
    });
    if (p.isCancel(text)) process.exit(0);
    persona = (text as string) ?? "";
    if (persona) {
      p.log.success(t("persona_saved"));
    } else {
      p.log.success(t("persona_skipped"));
    }
  } else {
    p.log.success(t("persona_skipped"));
  }

  // Step 5: Save
  const configData: Record<string, unknown> = {
    channel: channels.length === 1 ? channels[0] : channels,
  };
  for (const [key, cfg] of Object.entries(channelConfigs)) {
    configData[key] = cfg;
  }
  if (persona) {
    configData.persona = persona;
  }

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
