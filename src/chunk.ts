/**
 * Message chunking for platform-specific length limits.
 *
 * Inspired by OpenClaw's chunking architecture:
 * - Paragraph boundary (\n\n) preferred
 * - Falls back to newline (\n), then whitespace, then hard break
 * - Markdown code fence aware: closes and reopens fences at chunk boundaries
 */

// ---------------------------------------------------------------------------
// Character-based chunking (QQ, general purpose)
// ---------------------------------------------------------------------------

/**
 * Split text into chunks that each fit within `limit` characters.
 * Prefers breaking at paragraph boundaries, then newlines, then whitespace.
 * Handles Markdown code fences: if a break falls inside a fenced block,
 * the current chunk gets a closing fence and the next chunk gets an opening fence.
 */
export function chunkText(text: string, limit: number): string[] {
  if (!text || limit <= 0 || text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    // Avoid slicing in the middle of a surrogate pair (4-byte emoji)
    let safeLimit = limit;
    if (limit < remaining.length) {
      const code = remaining.charCodeAt(limit - 1);
      if (code >= 0xd800 && code <= 0xdbff) safeLimit = limit - 1;
    }
    const window = remaining.slice(0, safeLimit);
    const breakIdx = findBreakPoint(window);

    const rawChunk = remaining.slice(0, breakIdx);
    const nextStart = skipSeparator(remaining, breakIdx);
    const nextRemaining = remaining.slice(nextStart);

    // Handle code fence continuity
    const { chunk, prefix } = handleFences(rawChunk, nextRemaining);
    const trimmed = chunk.trimEnd();
    if (trimmed) chunks.push(trimmed);

    remaining = prefix + nextRemaining.trimStart();
  }

  if (remaining.trimEnd()) {
    chunks.push(remaining.trimEnd());
  }

  return chunks.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Byte-based chunking (WeChat Work: 2048 byte limit for text messages)
// ---------------------------------------------------------------------------

/**
 * Split text into chunks that each fit within `byteLimit` bytes (UTF-8).
 * Same break-point strategy as chunkText, but measures in bytes.
 */
export function chunkTextByBytes(text: string, byteLimit: number): string[] {
  const totalBytes = Buffer.byteLength(text, "utf-8");
  if (!text || byteLimit <= 0 || totalBytes <= byteLimit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (Buffer.byteLength(remaining, "utf-8") > byteLimit) {
    // Find the character index corresponding to the byte limit
    const charLimit = byteOffsetToCharIndex(remaining, byteLimit);
    const window = remaining.slice(0, charLimit);
    const breakIdx = findBreakPoint(window);

    const rawChunk = remaining.slice(0, breakIdx);
    const nextStart = skipSeparator(remaining, breakIdx);
    const nextRemaining = remaining.slice(nextStart);

    const { chunk, prefix } = handleFences(rawChunk, nextRemaining);
    const trimmed = chunk.trimEnd();
    if (trimmed) chunks.push(trimmed);

    remaining = prefix + nextRemaining.trimStart();
  }

  if (remaining.trimEnd()) {
    chunks.push(remaining.trimEnd());
  }

  return chunks.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Break point detection
// ---------------------------------------------------------------------------

/** Find the best break point within a text window. */
function findBreakPoint(window: string): number {
  // Priority 1: paragraph boundary (\n\n)
  const lastParagraph = window.lastIndexOf("\n\n");
  if (lastParagraph > 0) return lastParagraph;

  // Priority 2: newline (outside code fences if possible)
  const lastNewline = window.lastIndexOf("\n");
  if (lastNewline > 0) return lastNewline;

  // Priority 3: whitespace (word boundary)
  const lastSpace = findLastWhitespace(window);
  if (lastSpace > 0) return lastSpace;

  // Priority 4: hard break at limit
  return window.length;
}

/** Find last whitespace (space/tab) position, ignoring newlines. */
function findLastWhitespace(text: string): number {
  for (let i = text.length - 1; i > 0; i--) {
    const ch = text[i];
    if (ch === " " || ch === "\t") return i;
  }
  return -1;
}

/** Skip the separator character at the break point. */
function skipSeparator(text: string, breakIdx: number): number {
  if (breakIdx < text.length && /\s/.test(text[breakIdx])) {
    return breakIdx + 1;
  }
  return breakIdx;
}

// ---------------------------------------------------------------------------
// Markdown code fence handling
// ---------------------------------------------------------------------------

/**
 * If breaking inside a code fence, close the fence in the current chunk
 * and prepare a fence-opening prefix for the next chunk.
 */
function handleFences(
  rawChunk: string,
  _nextRemaining: string,
): { chunk: string; prefix: string } {
  const fenceState = getFenceState(rawChunk);

  if (!fenceState) {
    // Not inside a code fence — no adjustment needed
    return { chunk: rawChunk, prefix: "" };
  }

  // Close the fence in the current chunk
  const closingFence = fenceState.marker;
  const chunk = rawChunk.trimEnd() + "\n" + closingFence;

  // Re-open the fence in the next chunk
  const openingFence = fenceState.openLine;
  const prefix = openingFence + "\n";

  return { chunk, prefix };
}

/**
 * Determine if the text ends inside an unclosed code fence.
 * Returns the fence state if inside a fence, null otherwise.
 */
function getFenceState(
  text: string,
): { marker: string; openLine: string } | null {
  let insideFence = false;
  let currentMarker = "";
  let currentOpenLine = "";

  const lines = text.split("\n");
  for (const line of lines) {
    if (insideFence) {
      // Check if this line closes the current fence
      const trimmed = line.trim();
      if (
        trimmed === currentMarker ||
        (trimmed.startsWith(currentMarker) &&
          trimmed.slice(currentMarker.length).trim() === "")
      ) {
        insideFence = false;
        currentMarker = "";
        currentOpenLine = "";
      }
    } else {
      // Check if this line opens a new fence
      const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
      if (match) {
        insideFence = true;
        currentMarker = match[2];
        currentOpenLine = line;
      }
    }
  }

  if (insideFence) {
    return { marker: currentMarker, openLine: currentOpenLine };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Byte / character index conversion
// ---------------------------------------------------------------------------

/**
 * Find the character index in `text` at which the UTF-8 byte count
 * first exceeds `byteLimit`. Returns that character index so that
 * slicing text at that point yields a chunk ≤ byteLimit bytes.
 */
function byteOffsetToCharIndex(text: string, byteLimit: number): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    let charBytes: number;
    let isSurrogatePair = false;
    if (code <= 0x7f) charBytes = 1;
    else if (code <= 0x7ff) charBytes = 2;
    else if (code <= 0xffff) charBytes = 3;
    else {
      charBytes = 4;
      isSurrogatePair = true;
    }
    // Check overflow before advancing, so we never return an index
    // that splits a surrogate pair
    if (bytes + charBytes > byteLimit) return i;
    bytes += charBytes;
    if (isSurrogatePair) i++;
  }
  return text.length;
}
