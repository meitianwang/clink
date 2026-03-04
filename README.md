# Klaus

在 QQ / 企业微信 中使用 Claude Code。

Klaus 基于 [Claude Code SDK](https://www.npmjs.com/package/@anthropic-ai/claude-code)，将 Claude Code 接入即时通讯平台。自动处理多轮对话、会话管理、消息合并（Collect 模式），并支持图片、文件、语音等富媒体消息。

## 安装

> 包名是 `klaus-ai`，安装后使用 `klaus` 命令。

### npm（推荐）

```bash
npm install -g klaus-ai
```

### 一键脚本

```bash
curl -fsSL https://raw.githubusercontent.com/meitianwang/klaus/main/install.sh | bash
```

脚本会自动安装 Node.js（如缺失）、Claude Code CLI 和 Klaus。

## 前置条件

- **Node.js >= 18**
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- 已登录的 Claude Code 账号（运行 `claude` 完成登录）

## 快速开始

```bash
# 首次运行自动进入配置向导
klaus start

# 单独运行配置
klaus setup

# 诊断环境问题
klaus doctor
```

## 支持的通道

| 通道 | 传输方式 | 需要公网 IP | 富媒体支持 |
|------|---------|------------|-----------|
| QQ Bot | WebSocket | 不需要 | ✅ |
| 企业微信 | HTTP 回调 | 需要 | ✅ |

### QQ Bot

1. 前往 [QQ 开放平台](https://q.qq.com/) 创建机器人
2. 在 开发 > 开发设置 中获取 AppID 和 AppSecret
3. 运行 `klaus setup`，选择 QQ
4. 在 开发 > 沙箱配置 添加测试用户
5. 用手机 QQ 扫描沙箱二维码即可开始聊天

> `qq-group-bot` SDK 会在首次使用时自动安装。

#### 支持的消息类型

| 类型 | 说明 |
|------|------|
| 文本 | 直接识别 |
| 图片 | 下载到本地，Claude 通过 Read 工具查看 |
| 文件（PDF、Excel 等） | 下载到本地，Claude 通过 Read 工具查看 |
| 视频 / 语音 | 提示用户发送文字（暂不支持） |
| 表情 | 识别为 `[表情:描述]` |
| @提及 | 识别为 `[@用户:id]` |
| 引用回复 | 自动获取被引用消息的内容 |

### 企业微信 (WeCom)

1. 登录 [work.weixin.qq.com](https://work.weixin.qq.com/)
2. 在 我的企业 获取 Corp ID
3. 创建自建应用，获取 Agent ID + Secret
4. 在 接收消息 设置回调 URL
5. 运行 `klaus setup`，选择企业微信

**提示**：使用 [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 将本地端口暴露到公网：

```bash
cloudflared tunnel --url http://localhost:8080
```

#### 支持的消息类型

| 类型 | 说明 |
|------|------|
| 文本 | 直接识别 |
| 图片 | 通过 PicUrl 下载到本地，Claude 通过 Read 工具查看 |
| 文件 | 通过企业微信 media API 下载，Claude 通过 Read 工具查看 |
| 语音 | 有语音识别结果时自动转文字；无识别时提示用户发文字 |
| 视频 | 提示用户发送文字或截图（暂不支持） |
| 位置 | 自动解析为地点名称 + 经纬度坐标 |
| 链接 | 自动解析为标题 + 描述 + URL |

## 配置

配置文件：`~/.klaus/config.yaml`

```yaml
channel: qq          # 或 wecom
persona: "You are a helpful AI assistant."

qq:
  appid: "your-appid"
  secret: "your-secret"

wecom:
  corp_id: "your-corp-id"
  corp_secret: "your-secret"
  agent_id: 1000002
  token: "callback-token"
  encoding_aes_key: "aes-key"
  port: 8080
```

环境变量（`QQ_BOT_APPID`、`WECOM_CORP_ID` 等）可覆盖配置文件中的值。

### 配置验证

`klaus start` 启动时会自动验证配置，检查必填字段和格式。如有问题会一次性列出所有错误并退出，不会静默失败：

```
Config invalid
File: ~/.klaus/config.yaml

  ✗ wecom.corp_id: missing required field "corp_id" (or env: WECOM_CORP_ID)
    → provide Corp ID
  ✗ wecom.encoding_aes_key: invalid "encoding_aes_key": must be exactly 43 characters (Base64)

  Run klaus doctor to diagnose, or klaus setup to reconfigure.
```

`klaus doctor` 也会复用相同的验证逻辑进行诊断。

## 聊天命令

| 命令 | 效果 |
|------|------|
| `/new` `/reset` `/clear` | 重置当前对话 |
| `/help` | 显示可用命令列表 |
| `/session` | 查看当前会话信息（状态、模型） |
| `/model` | 查看当前使用的模型 |
| `/model <名称>` | 切换模型（sonnet / opus / haiku） |

## 工作原理

```
用户消息 → 通道 (QQ/WeCom) → InboundMessage → formatPrompt() → 会话管理器 → ClaudeChat → Claude Code SDK
                                    ↑                                 ↑
                            结构化消息提取                        LRU 淘汰
                          (图片/文件/语音等)                   (最多 20 个会话)
```

- **结构化消息**：通道将平台消息解析为统一的 `InboundMessage` 结构（文本、图片、文件、语音、位置、链接等），`formatPrompt()` 集中转换为 Claude 可理解的文本提示词。
- **Collect 模式**：Claude 处理中时，后续消息自动排队并合并为一条 prompt，处理完毕后一并发送。
- **LRU 会话管理**：最多维持 20 个并发会话，空闲最久的会话优先淘汰。
- **富媒体解析**：图片和文件下载到临时目录，以文件路径传递给 Claude，Claude 通过 Read 工具直接查看图片和 PDF 内容。
- **消息分片**：Claude 的长回复自动按平台限制拆分发送（QQ 按字符数、企业微信按 UTF-8 字节数），避免被平台截断。
- **自动重试**：API 调用失败（限频、token 过期、网络抖动）时自动指数退避重试；QQ WebSocket 断连后自动重连。

## License

MIT
