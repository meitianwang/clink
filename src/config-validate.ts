/**
 * Config validation — fail fast at startup with actionable messages.
 * Inspired by OpenClaw's multi-layer validation pipeline.
 */

import { existsSync, readFileSync } from "node:fs";
import yaml from "js-yaml";
import pc from "picocolors";
import { CONFIG_FILE } from "./config.js";
import { listChannelIds } from "./channels/types.js";

// Builtin channel IDs — fallback when registry is empty (e.g. doctor command)
const BUILTIN_CHANNELS = ["qq", "wecom"] as const;

function resolveKnownChannels(): readonly string[] {
  const registered = listChannelIds();
  return registered.length > 0 ? registered : BUILTIN_CHANNELS;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfigIssue = {
  readonly path: string;
  readonly message: string;
  readonly hint?: string;
};

export type ValidationResult = {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<ConfigIssue>;
  readonly config: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Per-channel required fields
// ---------------------------------------------------------------------------

type FieldSpec = {
  readonly key: string;
  readonly env?: string;
  readonly label: string;
  readonly validate?: (value: unknown) => string | null;
};

const QQ_FIELDS: readonly FieldSpec[] = [
  { key: "appid", env: "QQ_BOT_APPID", label: "QQ Bot App ID" },
  { key: "secret", env: "QQ_BOT_SECRET", label: "QQ Bot Secret" },
];

const WECOM_FIELDS: readonly FieldSpec[] = [
  { key: "corp_id", env: "WECOM_CORP_ID", label: "Corp ID" },
  { key: "corp_secret", env: "WECOM_CORP_SECRET", label: "Corp Secret" },
  {
    key: "agent_id",
    env: "WECOM_AGENT_ID",
    label: "Agent ID",
    validate: (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0
        ? null
        : "must be a positive integer";
    },
  },
  { key: "token", env: "WECOM_TOKEN", label: "Token" },
  {
    key: "encoding_aes_key",
    env: "WECOM_ENCODING_AES_KEY",
    label: "Encoding AES Key",
    validate: (v) =>
      typeof v === "string" && v.length === 43
        ? null
        : "must be exactly 43 characters (Base64)",
  },
  {
    key: "port",
    env: "WECOM_PORT",
    label: "HTTP Port",
    validate: (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 65535
        ? null
        : "must be a valid port number (1–65535)";
    },
  },
];

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

export function validateConfig(): ValidationResult {
  const issues: ConfigIssue[] = [];

  // ---- File existence ----
  if (!existsSync(CONFIG_FILE)) {
    return {
      valid: false,
      issues: [
        {
          path: "",
          message: `Config file not found: ${CONFIG_FILE}`,
          hint: "run: klaus setup",
        },
      ],
      config: {},
    };
  }

  // ---- YAML parsing ----
  let raw: Record<string, unknown>;
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = yaml.load(content);
    if (parsed == null || typeof parsed !== "object") {
      return {
        valid: false,
        issues: [
          {
            path: "",
            message: "Config file is empty or not a valid YAML mapping",
            hint: "run: klaus setup",
          },
        ],
        config: {},
      };
    }
    raw = parsed as Record<string, unknown>;
  } catch (err) {
    return {
      valid: false,
      issues: [
        {
          path: "",
          message: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      config: {},
    };
  }

  // ---- channel field ----
  const channel = raw.channel;
  if (!channel || typeof channel !== "string") {
    issues.push({
      path: "channel",
      message: 'missing required field "channel"',
      hint: `expected one of: ${resolveKnownChannels().join(", ")}`,
    });
    return { valid: false, issues, config: raw };
  }

  const knownIds = resolveKnownChannels();
  if (!knownIds.includes(channel)) {
    issues.push({
      path: "channel",
      message: `unknown channel "${channel}"`,
      hint: `available: ${knownIds.join(", ")}`,
    });
    // Continue validating so we still report other issues
  }

  // ---- Channel-specific fields ----
  const fieldSpecs = channelFieldSpecs(channel);
  if (fieldSpecs) {
    const section = (raw[channel] as Record<string, unknown>) ?? {};
    for (const spec of fieldSpecs) {
      const value = section[spec.key] ?? (spec.env ? process.env[spec.env] : undefined);
      if (value == null || value === "") {
        const envNote = spec.env ? ` (or env: ${spec.env})` : "";
        issues.push({
          path: `${channel}.${spec.key}`,
          message: `missing required field "${spec.key}"${envNote}`,
          hint: `provide ${spec.label}`,
        });
        continue;
      }
      if (spec.validate) {
        const err = spec.validate(value);
        if (err) {
          issues.push({
            path: `${channel}.${spec.key}`,
            message: `invalid "${spec.key}": ${err}`,
          });
        }
      }
    }
  }

  return { valid: issues.length === 0, issues, config: raw };
}

function channelFieldSpecs(channel: string): readonly FieldSpec[] | null {
  switch (channel) {
    case "qq":
      return QQ_FIELDS;
    case "wecom":
      return WECOM_FIELDS;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Formatted output
// ---------------------------------------------------------------------------

export function formatValidationIssues(issues: ReadonlyArray<ConfigIssue>): string {
  const lines: string[] = [];
  for (const issue of issues) {
    const prefix = issue.path ? pc.yellow(issue.path) + ": " : "";
    lines.push(`  ${pc.red("✗")} ${prefix}${issue.message}`);
    if (issue.hint) {
      lines.push(`    ${pc.dim("→ " + issue.hint)}`);
    }
  }
  return lines.join("\n");
}

/**
 * Validate config and exit if invalid. Call this before starting any channel.
 * Returns the raw config on success.
 */
export function ensureConfigValid(): Record<string, unknown> {
  const result = validateConfig();
  if (!result.valid) {
    console.error(`\n${pc.red(pc.bold("Config invalid"))}`);
    console.error(`${pc.dim("File:")} ${CONFIG_FILE}\n`);
    console.error(formatValidationIssues(result.issues));
    console.error(`\n  ${pc.dim("Run")} ${pc.cyan("klaus doctor")} ${pc.dim("to diagnose, or")} ${pc.cyan("klaus setup")} ${pc.dim("to reconfigure.")}\n`);
    process.exit(1);
  }
  return result.config;
}
