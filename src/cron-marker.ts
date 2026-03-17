/**
 * Cron marker parser — extracts [[cron:action {json}]] markers from Claude's reply.
 *
 * Enables AI-driven cron task management: Claude includes markers in replies,
 * the handler extracts them, executes cron operations, and strips markers
 * from the displayed text.
 */

import type { CronTask, CronDelivery } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CronMarkerAction =
  | { readonly action: "add"; readonly task: CronTask }
  | {
      readonly action: "edit";
      readonly id: string;
      readonly patch: Partial<CronTask>;
    }
  | { readonly action: "remove"; readonly id: string }
  | { readonly action: "enable"; readonly id: string }
  | { readonly action: "disable"; readonly id: string };

interface CronMarkerResult {
  /** Reply text with all [[cron:...]] markers stripped. */
  readonly text: string;
  /** Parsed cron actions to execute. */
  readonly actions: readonly CronMarkerAction[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const CRON_MARKER_PATTERN =
  /\[\[cron:(add|edit|remove|enable|disable)\s+(\{[\s\S]*?\})\]\]/g;

// Safe ID: only alphanumeric, dash, underscore, dot
const SAFE_ID_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Parse [[cron:action {json}]] markers from a reply string.
 * Returns the cleaned text and parsed actions.
 */
export function parseCronMarkers(reply: string): CronMarkerResult {
  const actions: CronMarkerAction[] = [];

  // Use fresh regex per call to avoid shared lastIndex state
  const re = new RegExp(CRON_MARKER_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(reply)) !== null) {
    const actionType = match[1] as
      | "add"
      | "edit"
      | "remove"
      | "enable"
      | "disable";
    const jsonStr = match[2];

    try {
      const data = JSON.parse(jsonStr) as Record<string, unknown>;
      const parsed = parseAction(actionType, data);
      if (parsed) {
        actions.push(parsed);
      }
    } catch (err) {
      console.warn(`[CronMarker] Failed to parse marker: ${err}`);
    }
  }

  // Strip all markers from displayed text
  const text = reply.replace(CRON_MARKER_PATTERN, "").trim();

  return { text, actions };
}

function parseAction(
  action: string,
  data: Record<string, unknown>,
): CronMarkerAction | null {
  switch (action) {
    case "add":
      return parseAddAction(data);
    case "edit":
      return parseEditAction(data);
    case "remove":
    case "enable":
    case "disable":
      return parseIdAction(action, data);
    default:
      return null;
  }
}

function parseAddAction(
  data: Record<string, unknown>,
): CronMarkerAction | null {
  const id = String(data.id ?? "");
  if (!id || !SAFE_ID_RE.test(id)) {
    console.warn(`[CronMarker] Invalid task ID: "${id}"`);
    return null;
  }

  const schedule = String(data.schedule ?? "");
  const prompt = String(data.prompt ?? "");
  if (!schedule || !prompt) {
    console.warn(`[CronMarker] Missing schedule or prompt for task "${id}"`);
    return null;
  }

  const task: CronTask = {
    id,
    schedule,
    prompt,
    enabled: true,
    ...(data.name != null ? { name: String(data.name) } : {}),
    ...(data.description != null
      ? { description: String(data.description) }
      : {}),
    ...(data.model != null ? { model: String(data.model) } : {}),
    ...(data.lightContext === true ? { lightContext: true } : {}),
    ...(data.timeoutSeconds != null
      ? { timeoutSeconds: Math.floor(Number(data.timeoutSeconds)) }
      : {}),
    ...(data.deliver ? { deliver: parseDeliver(data.deliver) } : {}),
  };

  return { action: "add", task };
}

function parseEditAction(
  data: Record<string, unknown>,
): CronMarkerAction | null {
  const id = String(data.id ?? "");
  if (!id || !SAFE_ID_RE.test(id)) {
    console.warn(`[CronMarker] Invalid task ID for edit: "${id}"`);
    return null;
  }

  // Build patch from all fields except 'id'
  const patch: Record<string, unknown> = {};
  if (data.schedule != null) patch.schedule = String(data.schedule);
  if (data.prompt != null) patch.prompt = String(data.prompt);
  if (data.name != null) patch.name = String(data.name);
  if (data.description != null) patch.description = String(data.description);
  if (data.model != null) patch.model = String(data.model);
  if (data.lightContext != null)
    patch.lightContext = data.lightContext === true;
  if (data.timeoutSeconds != null)
    patch.timeoutSeconds = Math.floor(Number(data.timeoutSeconds));
  if (data.enabled != null) patch.enabled = data.enabled === true;
  if (data.deliver != null) patch.deliver = parseDeliver(data.deliver);

  if (Object.keys(patch).length === 0) {
    console.warn(`[CronMarker] Empty patch for edit "${id}"`);
    return null;
  }

  return { action: "edit", id, patch: patch as Partial<CronTask> };
}

function parseIdAction(
  action: "remove" | "enable" | "disable",
  data: Record<string, unknown>,
): CronMarkerAction | null {
  const id = String(data.id ?? "");
  if (!id || !SAFE_ID_RE.test(id)) {
    console.warn(`[CronMarker] Invalid task ID for ${action}: "${id}"`);
    return null;
  }
  return { action, id };
}

function parseDeliver(raw: unknown): CronDelivery | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const channel = String(d.channel ?? "web");
  return {
    channel,
    ...(d.to ? { to: String(d.to) } : {}),
    ...(d.mode ? { mode: String(d.mode) as CronDelivery["mode"] } : {}),
    ...(d.bestEffort === true ? { bestEffort: true } : {}),
  };
}
