# Skill: Add a New Channel to cpaw

Step-by-step guide for adding a new messaging channel (e.g., Telegram, Slack, Discord).

## Architecture Overview

```
src/index.ts          → channel class import + start()
src/channels/base.ts  → Channel abstract class + Handler type
src/channels/xxx.ts   → Your new channel implementation
src/config.ts         → loadXxxConfig() function
src/types.ts          → XxxConfig interface
src/setup-wizard.ts   → i18n texts + collect_config() + verify_connection()
src/doctor.ts         → Credential validation
src/i18n.ts           → Translation texts
```

## Checklist (7 files to touch)

### 1. `src/channels/<name>.ts` — Channel Implementation

Inherit from `Channel`, implement `async start(handler)`.

```typescript
import { Channel, type Handler } from "./base.js";
import { loadXxxConfig } from "../config.js";

export class XxxChannel extends Channel {
  private cfg = loadXxxConfig();

  async start(handler: Handler): Promise<void> {
    console.log("Cpaw Xxx channel starting...");
    // Connect to platform, listen for messages
    // When message received:
    //   const reply = await handler(sessionKey, prompt);
    //   send reply back to user

    // Block forever
    await new Promise(() => {});
  }
}
```

**Key patterns:**

- `Handler` signature: `(sessionKey: string, text: string) => Promise<string | null>`.
- Return `null` means message was merged (collect mode), skip reply.
- Always wrap `handler()` in try/catch:
  ```typescript
  try {
    const reply = await handler(sessionKey, prompt);
    if (reply === null) return; // merged
    await sendReply(reply);
  } catch (err) {
    console.error(`[Xxx] Error: ${err}`);
  }
  ```
- Add `console.log` for received/replied messages:
  ```typescript
  console.log(`[Xxx] Received (${sessionKey}): ${prompt.slice(0, 120)}`);
  console.log(`[Xxx] Replying: ${reply.slice(0, 100)}...`);
  ```
- `start()` must block forever. Use `await new Promise(() => {})` if your SDK callback is non-blocking.

**Gotcha — SDK Intent/Permission Configuration:**

Many bot SDKs require explicit intent/event subscription. Get this wrong and the bot connects successfully but receives NO messages — with NO error output. Always verify which intent flag maps to which event handler by reading the SDK source, not just the docs.

### 2. Rich Media Support (REQUIRED)

Every channel **MUST** support rich media messages, not just text. See `src/channels/qq.ts` as the reference implementation.

#### Required infrastructure (can be shared across channels):

```typescript
import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";

interface MsgElem {
  type: string;
  [key: string]: unknown;
}

const TEMP_DIR = join(tmpdir(), "cpaw-files");
mkdirSync(TEMP_DIR, { recursive: true });
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
```

#### File download helper:

```typescript
async function downloadFile(rawUrl: string, name?: string): Promise<string> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const contentLength = Number(resp.headers.get("content-length") ?? 0);
  if (contentLength > MAX_DOWNLOAD_SIZE) {
    throw new Error(`File too large: ${contentLength} bytes`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  // Sanitize name to prevent path traversal
  const safeName = name ? basename(name).replace(/[^\w.\-]/g, "_") : undefined;
  const filename = safeName
    ? `${Date.now()}-${safeName}`
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filepath = join(TEMP_DIR, filename);
  writeFileSync(filepath, buffer);
  return filepath;
}
```

**Security requirements:**
- `basename()` to strip path components (prevent path traversal)
- Timestamp prefix to avoid filename collision
- Size limit check before loading into memory
- Sanitize special characters in filename

#### buildPrompt — Converting message elements to prompt:

Every channel's SDK delivers messages differently, but the output prompt must follow the same format. Parse the SDK's message structure into a unified prompt:

| Element type | Prompt format | Claude ability |
|-------------|---------------|---------------|
| Text | Direct text | ✅ |
| Image | `[图片: /tmp/cpaw-files/xxx.png，请用 Read 工具查看]` | ✅ Read tool |
| File (PDF etc.) | `[文件: /tmp/cpaw-files/doc.pdf，请用 Read 工具查看]` | ✅ Read tool |
| Video | `[视频文件: /tmp/cpaw-files/xxx.mp4]` | ❌ but knows it exists |
| Audio | `[语音文件: /tmp/cpaw-files/xxx.mp3]` | ❌ but knows it exists |
| Emoji/Sticker | `[表情:描述]` | — |
| @Mention | `[@用户:id]` or `[@全体成员]` | — context |
| Reply/Quote | `[回复消息: "被引用的内容..."]` | — context |
| Unknown + URL | Download + `[文件: /path，请用 Read 工具查看]` | depends |
| Unknown no URL | Ignore | — |

**Key principles:**
1. **Download all media with URLs** (images, files, video, audio) to `TEMP_DIR`
2. **Don't clean up temp files** — Collect mode may delay processing; let OS clean `/tmp`
3. **Fallback gracefully** — if download fails, still include a placeholder in prompt
4. **Image/PDF paths let Claude use Read tool** — this is the core mechanism for multimodal support

#### Message cache for reply lookups:

Most bot APIs don't support fetching messages by ID. Use a local LRU cache:

```typescript
const MSG_CACHE = new Map<string, string>(); // message_id → prompt text
const MSG_CACHE_MAX = 200;

function cacheMessage(msgId: string, text: string): void {
  if (!msgId) return;
  if (MSG_CACHE.size >= MSG_CACHE_MAX) {
    const oldest = MSG_CACHE.keys().next().value!;
    MSG_CACHE.delete(oldest);
  }
  MSG_CACHE.set(msgId, text);
}
```

Cache every incoming message's prompt. When a reply element references a message_id, look it up in the cache.

#### Platform-specific parsing examples:

**QQ** (`qq-group-bot`): `e.message` is an array of `{type, ...fields}` elements. Types: `text`, `image`, `video`, `audio`, `face`, `at`, `reply`, `markdown`, plus `application` etc. from `attachments`.

**Telegram** (hypothetical): `message.text`, `message.photo[]`, `message.document`, `message.voice`, `message.reply_to_message`, `message.entities[].type === "mention"`.

**Slack** (hypothetical): `event.text`, `event.files[]`, `event.blocks[].type`, `event.thread_ts` for replies.

**WeChat Work**: XML message with `<MsgType>` (text/image/voice/video/file). Image/file via media API download.

Each channel must map its SDK's message structure to the unified prompt format above.

### 3. `src/types.ts` — Config Interface

```typescript
export interface XxxConfig {
  readonly apiToken: string;
  // ... other fields
}
```

### 4. `src/config.ts` — Config Loader

```typescript
export function loadXxxConfig(): XxxConfig {
  const cfg = loadConfig();
  const xxx = (cfg.xxx ?? {}) as Record<string, unknown>;
  return {
    apiToken: (xxx.api_token as string) ?? process.env.XXX_API_TOKEN ?? "",
  };
}
```

Rules:
- YAML config is primary, env vars are fallback
- Key names in YAML use `snake_case`
- Config section name = channel name

### 5. `src/index.ts` — Register Channel

Add import and instantiation in the channel switch:

```typescript
import { XxxChannel } from "./channels/xxx.js";

// In start():
case "xxx":
  channel = new XxxChannel();
  break;
```

### 6. `src/setup-wizard.ts` + `src/i18n.ts` — Interactive Setup

Add i18n texts (both English and Chinese) and setup flow. The setup guide text **MUST** cover:

1. **Where to get credentials** — exact URL, step-by-step
2. **Platform-specific gotchas** — sandbox mode, approval process, test user limits
3. **How to use the bot after setup** — don't assume users know!
4. **Display quirks** — name suffixes, avatar restrictions
5. **Permission/scope requirements** — what to enable for the bot to receive messages

### 7. `src/doctor.ts` — Diagnostic Check

Add credential validation for the new channel.

## Lessons Learned

1. **Intent/permission silent failures**: Bot connects and shows "online" but receives zero messages. No error. Always verify event subscription by reading SDK source code.

2. **Sandbox/test mode**: Many platforms have sandbox modes with restrictions. Document clearly.

3. **Bot discoverability**: Some platforms don't let users search for bots. Document the exact method (QR code, link, invite).

4. **Name display quirks**: Platforms may append suffixes (QQ adds "-测试中" in sandbox).

5. **All user-facing text must be bilingual** (English + Chinese).

6. **`start()` must block forever** until shutdown.

7. **Don't silently swallow errors** in handlers. Always log to stdout.

8. **Rich media is not optional** — every channel must parse all message types from its SDK, not just text. Users expect images, files, replies, and mentions to work.

## Testing a New Channel

```bash
# 1. Clean state
rm -rf ~/.cpaw/config.yaml

# 2. Run setup, select your new channel
cpaw setup

# 3. Verify environment
cpaw doctor

# 4. Start and send test messages
cpaw start

# 5. Test each message type:
#    - Pure text
#    - Image + text
#    - Image only (no text)
#    - File (PDF, etc.)
#    - Emoji/sticker
#    - Reply to a previous message
#    - @mention someone
#    - Video / audio (if platform supports)
```
