---
name: send-file
description: Send files to the user for download via the Web UI.
metadata: { "klaus": { "emoji": "📎", "always": true } }
---

# send-file

Write files to disk and mark them for delivery as download cards in the Web chat UI.

## When to Use

- User asks you to create, generate, or write a document (text, code, PDF, etc.)
- User asks you to export, save, or download something
- User says "send me", "give me the file", "export it", etc.
- You produced content that is better delivered as a file than inline text (e.g., long code, data files, configs)

## How It Works

1. Use the **Write** tool to create the file on disk
2. In your reply text, include the marker `[[file:/path/to/file]]`
3. The system extracts the marker, registers a secure download link, and pushes a download card to the user's browser
4. The marker is stripped from the displayed message — the user only sees the download card

## Rules

1. **Always use the Write tool** (not Bash `echo`/`cat`) to create the file
2. **Include `[[file:path]]` in your reply** — this is what triggers the download card
3. **Write to `/tmp/`** for generated files to avoid cluttering the workspace
4. **Use descriptive filenames** the user will recognize, e.g., `/tmp/quarterly-report.md`
5. **Do NOT paste long file content inline** — write to file and use the marker instead
6. The marker must match the exact path you wrote to

## Examples

User: "帮我写一份周报"
→ Write tool creates `/tmp/weekly-report.md`
→ Reply: `周报已生成 [[file:/tmp/weekly-report.md]]`

User: "把这段代码保存成文件发给我"
→ Write tool creates `/tmp/example.py`
→ Reply: `文件已准备好 [[file:/tmp/example.py]]`

User: "导出这个数据"
→ Write tool creates `/tmp/data-export.csv`
→ Reply: `数据已导出 [[file:/tmp/data-export.csv]]`
