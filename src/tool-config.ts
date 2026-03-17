/**
 * Tool configuration registry for Web channel visualization.
 *
 * Declarative configs drive how each Claude tool is displayed in the
 * browser chat UI.  `formatToolEvent()` pre-formats events on
 * the server so the HTML client only needs to render, not compute.
 */

// ---------------------------------------------------------------------------
// ToolEvent — produced by core.ts when Claude invokes tools
// ---------------------------------------------------------------------------

export interface ToolEvent {
  readonly type: "tool_start" | "tool_result";
  readonly toolUseId: string;
  readonly toolName: string;
  readonly timestamp: number;
  /** Present on tool_start */
  readonly input?: Record<string, unknown>;
  /** Present on tool_result */
  readonly isError?: boolean;
  /** Links to parent Agent tool when inside a sub-agent */
  readonly parentToolUseId?: string;
}

// ---------------------------------------------------------------------------
// ToolDisplayConfig — per-tool rendering configuration
// ---------------------------------------------------------------------------

interface ToolDisplayConfig {
  readonly icon: string;
  readonly label: string;
  readonly style: "terminal" | "file" | "search" | "default";
  readonly getValue: (input: Record<string, unknown>) => string;
  readonly getSecondary?: (
    input: Record<string, unknown>,
  ) => string | undefined;
}

function fileName(input: Record<string, unknown>): string {
  const fp = String(input.file_path ?? "");
  return fp.split("/").pop() ?? fp;
}

const TOOL_CONFIGS: Record<string, ToolDisplayConfig> = {
  Bash: {
    icon: "terminal",
    label: "Running command",
    style: "terminal",
    getValue: (input) => String(input.command ?? ""),
    getSecondary: (input) =>
      input.description ? String(input.description) : undefined,
  },
  Read: {
    icon: "file",
    label: "Reading file",
    style: "file",
    getValue: (input) => String(input.file_path ?? ""),
  },
  Edit: {
    icon: "edit",
    label: "Editing file",
    style: "file",
    getValue: fileName,
  },
  Write: {
    icon: "file-plus",
    label: "Creating file",
    style: "file",
    getValue: fileName,
  },
  Grep: {
    icon: "search",
    label: "Searching",
    style: "search",
    getValue: (input) => String(input.pattern ?? ""),
    getSecondary: (input) => (input.path ? `in ${input.path}` : undefined),
  },
  Glob: {
    icon: "search",
    label: "Finding files",
    style: "search",
    getValue: (input) => String(input.pattern ?? ""),
    getSecondary: (input) => (input.path ? `in ${input.path}` : undefined),
  },
  WebSearch: {
    icon: "globe",
    label: "Searching web",
    style: "default",
    getValue: (input) => String(input.query ?? ""),
  },
  WebFetch: {
    icon: "globe",
    label: "Fetching URL",
    style: "default",
    getValue: (input) => String(input.url ?? ""),
  },
  TodoWrite: {
    icon: "list",
    label: "Updating todo list",
    style: "default",
    getValue: () => "",
  },
  Agent: {
    icon: "agent",
    label: "Running sub-agent",
    style: "default",
    getValue: (input) =>
      String(input.description ?? input.prompt ?? "").slice(0, 80),
  },
  send_file: {
    icon: "download",
    label: "Sending file",
    style: "file",
    getValue: fileName,
  },
  find_skills: {
    icon: "search",
    label: "Searching skills",
    style: "search",
    getValue: (input) => String(input.query ?? ""),
  },
  install_skill: {
    icon: "download",
    label: "Installing skill",
    style: "default",
    getValue: (input) => String(input.slug ?? ""),
    getSecondary: (input) =>
      input.registry ? `from ${input.registry}` : undefined,
  },
};

const DEFAULT_CONFIG: ToolDisplayConfig = {
  icon: "tool",
  label: "Using tool",
  style: "default",
  getValue: (input) => {
    try {
      const s = JSON.stringify(input);
      return s.length > 100 ? s.slice(0, 100) + "…" : s;
    } catch {
      return "(complex input)";
    }
  },
};

function getToolConfig(toolName: string): ToolDisplayConfig {
  return TOOL_CONFIGS[toolName] ?? DEFAULT_CONFIG;
}

// ---------------------------------------------------------------------------
// Tool payload — pre-formatted for the HTML client
// ---------------------------------------------------------------------------

export interface ToolPayload {
  readonly type: "tool_start" | "tool_result";
  readonly toolUseId: string;
  readonly toolName: string;
  readonly timestamp: number;
  readonly display: {
    readonly icon: string;
    readonly label: string;
    readonly style: string;
    readonly value: string;
    readonly secondary?: string;
  };
  readonly isError?: boolean;
  readonly parentToolUseId?: string;
}

export function formatToolEvent(event: ToolEvent): ToolPayload {
  const config = getToolConfig(event.toolName);
  const input = event.input ?? {};
  return {
    type: event.type,
    toolUseId: event.toolUseId,
    toolName: event.toolName,
    timestamp: event.timestamp,
    display: {
      icon: config.icon,
      label: config.label,
      style: config.style,
      value: config.getValue(input),
      ...(config.getSecondary ? { secondary: config.getSecondary(input) } : {}),
    },
    ...(event.isError !== undefined ? { isError: event.isError } : {}),
    ...(event.parentToolUseId
      ? { parentToolUseId: event.parentToolUseId }
      : {}),
  };
}
