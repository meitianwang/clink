/**
 * send_file MCP tool — lets Claude send files to the user for download.
 *
 * The tool validates the file and returns metadata. The channel's onToolEvent
 * handler intercepts the tool_start event and triggers actual delivery
 * (registerDownloadToken + WebSocket file event) with full user context.
 */

import { z } from "zod/v4";
import {
  tool,
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { resolve, basename, join } from "node:path";
import { statSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { CONFIG_DIR } from "./config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKSPACES_DIR = join(CONFIG_DIR, "workspaces");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB (matches web.ts MAX_DOWNLOAD_SIZE)
const ALLOWED_DIRS = ["/tmp", tmpdir(), WORKSPACES_DIR];

// ---------------------------------------------------------------------------
// Tool description
// ---------------------------------------------------------------------------

const SEND_FILE_DESCRIPTION = `Send a file to the user for download.

Use this tool after creating or modifying a file that the user needs.
The file will be delivered as a download link in the chat.

WHEN TO USE:
- After writing a report, CSV, image, or any generated file
- When the user asks for a file export or download
- After processing/transforming a user-uploaded file

RULES:
- file_path must be an absolute path to an existing file
- File must be within the workspace directory or /tmp
- Max file size: 50 MB`;

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const SendFileInput = {
  file_path: z
    .string()
    .describe("Absolute path to the file to send to the user"),
  file_name: z
    .string()
    .optional()
    .describe("Optional display filename (defaults to the file's basename)"),
};

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function isPathAllowed(resolved: string): boolean {
  return ALLOWED_DIRS.some(
    (dir) => resolved === dir || resolved.startsWith(dir + "/"),
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function handleSendFile(args: Record<string, unknown>) {
  const filePath = args.file_path as string | undefined;
  if (!filePath) throw new Error("Missing required field: file_path");

  const resolved = resolve(filePath);

  // Resolve symlinks to prevent workspace escape
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    throw new Error(`File not found: ${resolved}`);
  }

  // Path safety check (against resolved real path)
  if (!isPathAllowed(real)) {
    throw new Error(
      `Path not allowed: ${resolved}. File must be within the workspace or /tmp.`,
    );
  }

  // File existence and type check
  let stat;
  try {
    stat = statSync(real);
  } catch {
    throw new Error(`File not found: ${resolved}`);
  }

  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }

  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(stat.size / 1024 / 1024).toFixed(1)} MB (max 50 MB)`,
    );
  }

  const fileName = (args.file_name as string | undefined) || basename(resolved);

  return textResult({
    status: "ok",
    filePath: resolved,
    fileName,
    fileSize: stat.size,
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSendFileMcpServer(): McpSdkServerConfigWithInstance {
  const sendFileTool = tool(
    "send_file",
    SEND_FILE_DESCRIPTION,
    SendFileInput,
    async (args) => {
      return handleSendFile(args as Record<string, unknown>);
    },
  );

  return createSdkMcpServer({
    name: "klaus-send-file",
    tools: [sendFileTool],
  });
}
