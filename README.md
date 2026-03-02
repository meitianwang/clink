# Clink

Use Claude Code from QQ, WeChat Work, or any messaging platform.

在 QQ、企业微信等聊天平台上使用 Claude Code。

---

## Features / 功能

- **Multi-channel** — QQ Bot, WeChat Work (WeCom), Terminal, and more
- **Full Claude Code** — tool calls, file operations, multi-turn conversations
- **Collect mode** — messages sent while the bot is busy are merged into one follow-up turn
- **One-line install** — `curl | bash`, interactive setup wizard
- **Custom persona** — set system prompt to control bot behavior (supports multi-line paste)
- **Multi-language** — English / 中文 setup wizard

---

## Quick Start / 快速开始

### Install / 安装

```bash
curl -fsSL https://raw.githubusercontent.com/meitianwang/clink/main/install.sh | bash
```

This will:
1. Install prerequisites (Python 3.10+, Node.js, Claude Code CLI)
2. Clone Clink to `~/.clink/app`
3. Create virtual environment and install dependencies
4. Run interactive setup wizard

安装脚本会自动完成:
1. 安装依赖 (Python 3.10+, Node.js, Claude Code CLI)
2. 克隆 Clink 到 `~/.clink/app`
3. 创建虚拟环境并安装 Python 依赖
4. 启动交互式配置向导

### Start / 启动

```bash
clink start
```

### Update / 更新

```bash
cd ~/.clink/app
git pull
pip install -r requirements.txt
clink start
```

Or re-run the installer (safe to run multiple times):

或者重新执行安装脚本 (可重复执行):

```bash
curl -fsSL https://raw.githubusercontent.com/meitianwang/clink/main/install.sh | bash
```

---

## Commands / 命令

| Command | Description |
|---------|-------------|
| `clink start` | Start the bot / 启动机器人 |
| `clink setup` | Re-run setup wizard / 重新运行配置向导 |
| `clink doctor` | Diagnose issues / 诊断环境问题 |

Chat commands (send from your messaging app):

聊天指令 (从聊天平台发送):

| Command | Description |
|---------|-------------|
| `/new` | Reset conversation / 重置对话 |
| `/reset` | Reset conversation / 重置对话 |
| `/clear` | Reset conversation / 重置对话 |

---

## Channels / 通道

### Terminal / 终端

Local terminal, no setup needed. Good for testing.

本地终端, 无需配置, 适合测试。

### QQ Bot / QQ 机器人

WebSocket-based, no public IP needed.

基于 WebSocket, 无需公网 IP。

**Setup / 配置步骤:**
1. Go to [QQ Bot Platform](https://q.qq.com/), create a bot
2. Get AppID and AppSecret from Development Settings
3. Run `clink setup`, select QQ, enter credentials

**Sandbox mode / 沙箱模式:**
- Bots default to sandbox mode (no review needed)
- Cannot search for the bot in QQ — must scan QR code
- Go to Development > Sandbox Config, add test users (up to ~20)
- Bot name will have a "-测试中" suffix (platform-enforced, does not affect functionality)
- For public use: submit for review at Management > Publish

默认沙箱模式, 无需审核。在 QQ 中搜不到机器人, 需在开发 > 沙箱配置中添加测试用户, 扫码添加。机器人名字会带「测试中」后缀, 审核通过后消失。

### WeChat Work / 企业微信

HTTP webhook-based, requires a public URL.

基于 HTTP 回调, 需要公网地址。

**Setup / 配置步骤:**
1. Login to [WeCom Admin](https://work.weixin.qq.com/wework_admin/loginpage_wx)
2. Get Corp ID from My Enterprise page
3. Create an app, get Agent ID and Secret
4. Set callback URL with Token and EncodingAESKey
5. Run `clink setup`, select WeCom, enter credentials

**Tip / 提示:** Use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose local port:

```bash
cloudflared tunnel --url http://localhost:8080
```

---

## Configuration / 配置

Config file: `~/.clink/config.yaml`

```yaml
channel: qq

qq:
  appid: "your_appid"
  secret: "your_secret"

# Optional: custom bot persona / 可选: 自定义机器人人设
persona: "你是一个友好的 AI 助手。"
```

Environment variables work as fallback (for Docker/CI):

环境变量作为备选 (适用于 Docker/CI):

| Variable | Description |
|----------|-------------|
| `QQ_BOT_APPID` | QQ Bot App ID |
| `QQ_BOT_SECRET` | QQ Bot App Secret |
| `WECOM_CORP_ID` | WeCom Corp ID |
| `WECOM_CORP_SECRET` | WeCom App Secret |
| `WECOM_AGENT_ID` | WeCom Agent ID |
| `WECOM_TOKEN` | WeCom Callback Token |
| `WECOM_ENCODING_AES_KEY` | WeCom AES Key |
| `WECOM_PORT` | WeCom callback port (default: 8080) |

---

## How It Works / 工作原理

### Message Collect Mode / 消息收集模式

When the bot is busy processing a message, incoming messages are **queued and merged** into a single follow-up turn (inspired by [OpenClaw](https://github.com/openclaw/openclaw)):

当机器人正在处理消息时, 新到达的消息会被**收集合并**为一个 follow-up turn (灵感来自 [OpenClaw](https://github.com/openclaw/openclaw)):

```
User: "find the singvc code"          → agent starts processing
User: "especially the inference part"  → queued
User: "and the training scripts"       → queued

Agent finishes first message → sends reply
  ↓
Merges queued messages: "especially the inference part\nand the training scripts"
  ↓
Processes as one turn → sends merged reply
```

This prevents response mix-ups, empty replies, and out-of-order messages.

避免了回复错位、空回复和乱序问题。

---

## Prerequisites / 环境要求

- Python >= 3.10
- Node.js (for Claude Code CLI)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`npm i -g @anthropic-ai/claude-code`)
- Anthropic API key configured in Claude Code

---

## Project Structure / 项目结构

```
clink/
├── clink.py             # Entry point / 入口
├── core.py              # Claude Code SDK wrapper / SDK 封装
├── config.py            # Config management / 配置管理
├── setup_wizard.py      # Interactive setup / 交互式引导
├── doctor.py            # Environment diagnostics / 环境诊断
├── install.sh           # One-line installer / 一键安装脚本
├── requirements.txt
└── channels/
    ├── base.py          # Channel ABC / 通道抽象基类
    ├── terminal.py      # Terminal channel / 终端通道
    ├── qq.py            # QQ Bot channel / QQ 机器人通道
    └── wecom.py         # WeChat Work channel / 企业微信通道
```

---

## Adding a New Channel / 添加新通道

See [.claude/skills/add-channel/SKILL.md](.claude/skills/add-channel/SKILL.md) for a step-by-step guide.

详见 [.claude/skills/add-channel/SKILL.md](.claude/skills/add-channel/SKILL.md)。

---

## License

MIT
