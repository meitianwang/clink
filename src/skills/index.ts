/**
 * Skill loader — aligned with OpenClaw's skill system.
 *
 * Two-stage loading:
 * 1. Load SKILL.md files from bundled dir + user dir (~/.klaus/skills/)
 * 2. Parse YAML frontmatter for metadata (name, description, gating)
 * 3. Filter by eligibility (binary presence, OS, env vars, config enabled/disabled)
 * 4. Inject compact XML summary into system prompt (not full content)
 * 5. Claude reads the full SKILL.md via Read tool on demand
 *
 * Sources (precedence high → low):
 *   ~/.klaus/skills/<name>/SKILL.md  (user overrides)
 *   <package>/skills/<name>/SKILL.md (bundled)
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import { loadConfig, CONFIG_DIR } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KlausSkillMetadata {
  readonly emoji?: string;
  readonly os?: readonly string[];
  readonly always?: boolean;
  readonly requires?: {
    readonly bins?: readonly string[];
    readonly anyBins?: readonly string[];
    readonly env?: readonly string[];
  };
  readonly install?: readonly {
    readonly id: string;
    readonly kind: string;
    readonly formula?: string;
    readonly package?: string;
    readonly label: string;
  }[];
}

interface SkillEntry {
  readonly name: string;
  readonly description: string;
  readonly filePath: string;
  readonly source: "bundled" | "user";
  readonly metadata?: KlausSkillMetadata;
}

interface SkillConfig {
  readonly enabled?: boolean;
  readonly env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  name: string;
  description: string;
  metadata?: KlausSkillMetadata;
}

function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm = match[1];
  // Simple YAML-like parsing for single-line values
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  const metaMatch = fm.match(/^metadata:\s*(.+)$/m);

  if (!nameMatch) return null;

  const name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
  const description = descMatch
    ? descMatch[1].trim().replace(/^["']|["']$/g, "")
    : "";

  let metadata: KlausSkillMetadata | undefined;
  if (metaMatch) {
    try {
      const raw = JSON.parse(metaMatch[1].trim());
      metadata = raw?.klaus ?? raw?.openclaw;
    } catch {
      // Ignore parse errors
    }
  }

  return { name, description, metadata };
}

// ---------------------------------------------------------------------------
// Binary detection
// ---------------------------------------------------------------------------

const binCache = new Map<string, boolean>();

function hasBinary(name: string): boolean {
  // Reject names with shell metacharacters to prevent command injection
  if (!/^[a-zA-Z0-9_.\-]+$/.test(name)) return false;

  const cached = binCache.get(name);
  if (cached !== undefined) return cached;

  try {
    const cmd = platform() === "win32" ? `where ${name}` : `which ${name}`;
    execSync(cmd, { stdio: "ignore" });
    binCache.set(name, true);
    return true;
  } catch {
    binCache.set(name, false);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Gating (eligibility check)
// ---------------------------------------------------------------------------

function isEligible(entry: SkillEntry, skillConfig?: SkillConfig): boolean {
  const meta = entry.metadata;

  // Explicitly disabled in config
  if (skillConfig?.enabled === false) return false;

  // Always-on skills
  if (meta?.always) return true;

  // OS check
  if (meta?.os && meta.os.length > 0) {
    if (!meta.os.includes(platform())) return false;
  }

  // Binary requirements
  if (meta?.requires?.bins) {
    for (const bin of meta.requires.bins) {
      if (!hasBinary(bin)) return false;
    }
  }

  // Any-binary requirements
  if (meta?.requires?.anyBins) {
    const hasAny = meta.requires.anyBins.some((bin) => hasBinary(bin));
    if (!hasAny) return false;
  }

  // Environment variable requirements
  if (meta?.requires?.env) {
    for (const envName of meta.requires.env) {
      if (!process.env[envName] && !skillConfig?.env?.[envName]) return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Skill loading from directories
// ---------------------------------------------------------------------------

function loadSkillsFromDir(
  dir: string,
  source: "bundled" | "user",
): SkillEntry[] {
  if (!existsSync(dir)) return [];

  const entries: SkillEntry[] = [];
  let dirEntries: string[];
  try {
    dirEntries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const name of dirEntries) {
    const skillFile = join(dir, name, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    try {
      const content = readFileSync(skillFile, "utf-8");
      const fm = parseFrontmatter(content);
      if (!fm) {
        console.warn(`[Skills] Invalid frontmatter in ${skillFile}`);
        continue;
      }

      entries.push({
        name: fm.name,
        description: fm.description,
        filePath: skillFile,
        source,
        metadata: fm.metadata,
      });
    } catch (err) {
      console.warn(`[Skills] Failed to read ${skillFile}:`, err);
    }
  }

  return entries;
}

function resolveBundledSkillsDir(): string {
  // Resolve relative to this file's location
  // In dev: src/skills/index.ts → ../../skills/
  // In dist: dist/index.js → ../skills/
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // Try common locations
  const candidates = [
    resolve(thisDir, "../../skills"), // dev: src/skills/ → skills/
    resolve(thisDir, "../skills"), // dist: dist/ → skills/
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }

  return candidates[0]; // fallback
}

const USER_SKILLS_DIR = join(CONFIG_DIR, "skills");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load all skill entries from bundled + user dirs, with user overriding bundled. */
function loadAllSkillEntries(): SkillEntry[] {
  const bundledDir = resolveBundledSkillsDir();
  const bundled = loadSkillsFromDir(bundledDir, "bundled");
  const user = loadSkillsFromDir(USER_SKILLS_DIR, "user");

  // User skills override bundled by name
  const byName = new Map<string, SkillEntry>();
  for (const entry of bundled) byName.set(entry.name, entry);
  for (const entry of user) byName.set(entry.name, entry);

  return Array.from(byName.values());
}

/** Resolve per-skill config from config.yaml. */
function resolveSkillConfig(skillName: string): SkillConfig | undefined {
  const cfg = loadConfig();
  const entries = (cfg.skills as Record<string, unknown>)?.entries as
    | Record<string, SkillConfig>
    | undefined;
  return entries?.[skillName];
}

/** Load enabled (eligible) skills after gating. */
export function loadEnabledSkills(): readonly SkillEntry[] {
  const cfg = loadConfig();
  const raw = cfg.skills;
  const all = loadAllSkillEntries();

  // always: true skills are loaded regardless of config
  const alwaysOn = all.filter(
    (e) => e.metadata?.always && isEligible(e, resolveSkillConfig(e.name)),
  );

  // No skills section → return only always-on skills
  if (!raw) return alwaysOn;

  let configured: SkillEntry[];

  if (raw === "all") {
    // "all" → load all, still apply gating
    configured = all.filter((e) => isEligible(e, resolveSkillConfig(e.name)));
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    // Object with entries → per-skill config
    configured = all.filter((e) => {
      const sc = resolveSkillConfig(e.name);
      if (sc?.enabled === false) return false;
      return isEligible(e, sc);
    });
  } else if (Array.isArray(raw)) {
    // Array of skill names → whitelist
    const names = new Set(raw.map(String));
    configured = all
      .filter((e) => names.has(e.name))
      .filter((e) => isEligible(e, resolveSkillConfig(e.name)));
  } else {
    configured = [];
  }

  // Merge: configured + always-on (deduplicate by name)
  const byName = new Map<string, SkillEntry>();
  for (const e of alwaysOn) byName.set(e.name, e);
  for (const e of configured) byName.set(e.name, e);
  return Array.from(byName.values());
}

/** List all available skill names (before gating). */
export function listSkillNames(): string[] {
  return loadAllSkillEntries().map((e) => e.name);
}

/** Apply env overrides from skill configs to process.env. */
export function applySkillEnvOverrides(): void {
  const enabled = loadEnabledSkills();
  for (const entry of enabled) {
    const sc = resolveSkillConfig(entry.name);
    if (!sc?.env) continue;
    for (const [key, value] of Object.entries(sc.env)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Compact XML prompt (OpenClaw-compatible format)
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Compact home dir in file paths to ~ (saves tokens). */
function compactPath(filePath: string): string {
  const home = homedir();
  if (!home) return filePath;
  const prefix = home.endsWith("/") ? home : home + "/";
  return filePath.startsWith(prefix)
    ? "~/" + filePath.slice(prefix.length)
    : filePath;
}

/** Build compact XML list of available skills for the system prompt. */
function formatSkillsXml(skills: readonly SkillEntry[]): string {
  if (skills.length === 0) return "";

  const items = skills.map((s) => {
    const emoji = s.metadata?.emoji
      ? ` emoji="${escapeXml(s.metadata.emoji)}"`
      : "";
    return [
      `  <skill${emoji}>`,
      `    <name>${escapeXml(s.name)}</name>`,
      `    <description>${escapeXml(s.description)}</description>`,
      `    <location>${escapeXml(compactPath(s.filePath))}</location>`,
      `  </skill>`,
    ].join("\n");
  });

  return `<available_skills>\n${items.join("\n")}\n</available_skills>`;
}

