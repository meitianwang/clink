/**
 * Standardized inbound message types and formatting.
 *
 * Inspired by OpenClaw's MsgContext, simplified for Klaus.
 * Channels produce InboundMessage objects; formatPrompt() converts them
 * into text prompts for Claude.
 */


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageType =
  | "text"
  | "image"
  | "voice"
  | "video"
  | "location"
  | "link"
  | "file"
  | "emoji"
  | "mixed";

export interface MediaFile {
  readonly type: "image" | "audio" | "video" | "file";
  readonly path?: string;
  readonly url?: string;
  readonly fileName?: string;
  /** ASR transcription result (voice messages). */
  readonly transcription?: string;
}

export interface ReplyContext {
  readonly messageId?: string;
  /** Preview of the replied-to message. */
  readonly text?: string;
}

export interface LocationInfo {
  readonly label?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly scale?: number;
}

export interface LinkInfo {
  readonly title?: string;
  readonly description?: string;
  readonly url: string;
}

export interface InboundMessage {
  readonly sessionKey: string;
  /** Main text content (empty string when no text). */
  readonly text: string;
  readonly messageType: MessageType;
  readonly chatType: "private" | "group";
  readonly senderId: string;
  readonly senderName?: string;
  readonly media?: readonly MediaFile[];
  readonly replyTo?: ReplyContext;
  readonly mentions?: readonly string[];
  readonly location?: LocationInfo;
  readonly link?: LinkInfo;
  readonly emoji?: { readonly id?: number; readonly description?: string };
  readonly timestamp?: number;
}

// ---------------------------------------------------------------------------
// Display text: InboundMessage → user-facing text (no internal paths)
// ---------------------------------------------------------------------------

/**
 * Convert a structured InboundMessage into user-facing display text.
 * Unlike formatPrompt(), this hides internal file paths and only shows
 * file names — safe to persist in message history and show in the UI.
 */
export function formatDisplayText(msg: InboundMessage): string {
  const parts: string[] = [];

  if (msg.text) {
    parts.push(msg.text);
  }

  if (msg.media?.length) {
    for (const file of msg.media) {
      switch (file.type) {
        case "image":
          parts.push(file.fileName ? `[图片: ${file.fileName}]` : "[图片]");
          break;
        case "audio":
          parts.push(
            file.transcription
              ? `[语音: "${file.transcription}"]`
              : "[语音消息]",
          );
          break;
        case "video":
          parts.push("[视频]");
          break;
        case "file":
          parts.push(`[文件: ${file.fileName || "未知文件"}]`);
          break;
      }
    }
  }

  return parts.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Format prompt: InboundMessage → text string for Claude
// ---------------------------------------------------------------------------

/**
 * Convert a structured InboundMessage into a text prompt for Claude.
 * Centralizes the formatting logic previously duplicated in each channel.
 */
export function formatPrompt(msg: InboundMessage): string {
  const parts: string[] = [];

  // Reply context (prepend)
  if (msg.replyTo?.text) {
    const preview =
      msg.replyTo.text.length > 200
        ? msg.replyTo.text.slice(0, 200) + "..."
        : msg.replyTo.text;
    parts.push(`[回复消息: "${preview}"]`);
  } else if (msg.replyTo) {
    parts.push("[回复了一条消息]");
  }

  // Mentions
  if (msg.mentions?.length) {
    for (const uid of msg.mentions) {
      parts.push(uid === "all" ? "[@全体成员]" : `[@用户:${uid}]`);
    }
  }

  // Text content
  if (msg.text) {
    parts.push(msg.text);
  }

  // Media files
  if (msg.media?.length) {
    for (const file of msg.media) {
      parts.push(formatMediaFile(file));
    }
  }

  // Emoji
  if (msg.emoji) {
    const desc = msg.emoji.description ?? msg.emoji.id;
    if (desc !== undefined && desc !== "") {
      parts.push(`[表情:${desc}]`);
    }
  }

  // Location
  if (msg.location) {
    const loc = msg.location;
    parts.push(
      "[用户分享了一个位置]\n" +
        `地点: ${loc.label || "未知"}\n` +
        `坐标: ${loc.latitude}, ${loc.longitude}` +
        (loc.scale != null ? `\n缩放: ${loc.scale}` : ""),
    );
  }

  // Link
  if (msg.link) {
    const linkParts = ["[用户分享了一个链接]"];
    if (msg.link.title) linkParts.push(`标题: ${msg.link.title}`);
    if (msg.link.description) linkParts.push(`描述: ${msg.link.description}`);
    if (msg.link.url) linkParts.push(`链接: ${msg.link.url}`);
    parts.push(linkParts.join("\n"));
  }

  return parts.join("\n").trim();
}

function formatMediaFile(file: MediaFile): string {
  switch (file.type) {
    case "image": {
      if (file.path) {
        return `[图片: ${file.path}，请用 Read 工具查看]`;
      }
      return "[图片: 下载失败]";
    }

    case "audio": {
      if (file.transcription) {
        return (
          `[用户发送了一段语音消息，语音识别结果: "${file.transcription}"]\n` +
          "请基于语音识别的内容回复用户。"
        );
      }
      return (
        "[用户发送了一段语音消息，但你目前无法听取语音。" +
        "请友好地告诉用户：语音消息暂不支持，请将想说的内容打字发送给你。]"
      );
    }

    case "video":
      return (
        "[用户发送了一段视频，但你目前无法观看视频。" +
        "请友好地告诉用户：视频消息暂不支持，请用文字描述视频内容或截图发送。]"
      );

    case "file": {
      if (file.path) {
        const displayName = file.fileName || "未知文件";
        return `[文件: ${file.path}，文件名: ${displayName}，请用 Read 工具查看]`;
      }
      return `[文件 ${file.fileName || "未知"}: 下载失败]`;
    }
  }
}

