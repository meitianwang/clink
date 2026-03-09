# Klaus

在浏览器中使用 Claude Code。

Klaus 基于 [Claude Code SDK](https://www.npmjs.com/package/@anthropic-ai/claude-code)，提供基于浏览器的 Web Chat UI。自动处理多轮对话、会话管理、消息合并（Collect 模式）。

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

## 网页聊天

无需任何第三方平台账号，直接在浏览器中和 Claude 对话。

1. 运行 `klaus setup`，选择 Web
2. Token 留空自动生成（也可自定义）
3. 选择是否启用 Cloudflare Tunnel（公网访问）
4. `klaus start` 启动后，打开终端显示的 URL 即可聊天

```
Klaus Web channel listening on http://localhost:3000
Chat URL: http://localhost:3000/?token=abc123...
```

**分享给别人**：将含 Token 的 URL 发给对方即可。每个 Token 对应一个独立会话。

**公网访问**：配置 `tunnel: true`，启动时会自动运行 `cloudflared tunnel`（需先安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)），生成公网 URL：

```bash
# macOS 安装 cloudflared
brew install cloudflared
```

## 定时任务 (Cron)

Klaus 支持 cron 定时任务，按计划自动执行 Claude 对话并可选推送结果到通道。

### 配置

在 `~/.klaus/config.yaml` 中添加 `cron` 段：

```yaml
cron:
  enabled: true
  tasks:
    - id: daily-summary
      name: "每日总结"
      schedule: "0 9 * * *"        # 每天 9:00
      prompt: "总结最近的技术新闻"
      model: sonnet                # 可选，覆盖默认模型
      deliver:                     # 可选，推送结果到通道
        channel: web
        to: "*"                    # "*" 广播 或 userId

    - id: health-check
      name: "健康检查"
      schedule: "*/30 * * * *"     # 每 30 分钟
      prompt: "检查系统状态"
      enabled: true
```

### 调度表达式

| 格式 | 示例 | 说明 |
|------|------|------|
| 标准 cron（5/6 段） | `0 9 * * *` | 每天 9:00 |
| 间隔 | `*/30 * * * *` | 每 30 分钟 |
| 一次性 | ISO 8601 时间戳 | 到达指定时间执行一次 |
| 相对时间 | `20m`、`1h`、`2h30m` | 从现在起的相对延迟 |

### 聊天命令

在聊天中发送 `/cron` 可查看定时任务状态：

```
/cron                    # 查看所有任务状态
/cron add <id> <cron> <prompt>  # 动态添加任务
/cron remove <id>        # 删除任务
/cron enable <id>        # 启用任务
/cron disable <id>       # 禁用任务
```

### 高级配置

```yaml
cron:
  enabled: true
  max_concurrent_runs: 3           # 最大并发任务数
  retry:
    max_attempts: 3                # 失败重试次数
    backoff_ms: [30000, 60000]     # 重试退避间隔
  failure_alert:                   # 连续失败告警
    enabled: true
    after: 2                       # 连续失败 N 次后告警
    channel: web
  tasks:
    - id: my-task
      schedule: "0 */6 * * *"
      prompt: "执行任务"
      timeout_seconds: 300         # 超时（默认 600 秒）
      delete_after_run: true       # 一次性任务，执行后自动删除
```

## 配置

配置文件：`~/.klaus/config.yaml`

```yaml
channel: web
persona: "You are a helpful AI assistant."

web:
  port: 3000                   # 默认 3000
  tunnel: false                # 是否自动启动 Cloudflare Tunnel

session:                       # 可选，会话持久化
  idle_minutes: 240            # 空闲超时（默认 4 小时）
  max_entries: 100             # 最大持久化会话数
  max_age_days: 7              # 过期清理天数
```

环境变量（`KLAUS_WEB_PORT` 等）可覆盖配置文件中的值。

### 配置验证

`klaus start` 启动时会自动验证配置，检查必填字段和格式。如有问题会一次性列出所有错误并退出，不会静默失败。

`klaus doctor` 也会复用相同的验证逻辑进行诊断。

## 聊天命令

| 命令 | 效果 |
|------|------|
| `/new` `/reset` `/clear` | 重置当前对话 |
| `/help` | 显示可用命令列表 |
| `/session` | 查看当前会话信息（状态、模型） |
| `/model` | 查看当前使用的模型 |
| `/model <名称>` | 切换模型（sonnet / opus / haiku） |
| `/cron` | 查看定时任务状态 |

## 工作原理

```
用户消息 → Web Channel → InboundMessage → formatPrompt() → 会话管理器 → ClaudeChat → Claude Code SDK
                                    ↑                                 ↑
                            结构化消息提取                        LRU 淘汰
                                                             (最多 20 个会话)
```

- **结构化消息**：通道将消息解析为统一的 `InboundMessage` 结构，`formatPrompt()` 集中转换为 Claude 可理解的文本提示词。
- **Collect 模式**：Claude 处理中时，后续消息自动排队并合并为一条 prompt，处理完毕后一并发送。
- **LRU 会话管理**：最多维持 20 个并发会话，空闲最久的会话优先淘汰。
- **会话持久化**：会话 ID 保存到 `~/.klaus/sessions.json`，重启后自动恢复（默认 4 小时内有效）。
- **自动重试**：API 调用失败时自动指数退避重试。
- **定时任务**：Cron 调度器按计划执行 Claude 对话，每个任务使用独立会话，结果可推送到 Web 通道。

## License

MIT
