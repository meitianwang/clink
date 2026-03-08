type Lang = "en" | "zh";

const TEXTS: Record<string, Record<Lang, string>> = {
  // ── Setup ──
  setup_title: {
    en: " Klaus Setup ",
    zh: " Klaus 安装引导 ",
  },
  config_exists: {
    en: "Config already exists at {path}\nCurrent channel(s): {channel}",
    zh: "配置文件已存在: {path}\n当前通道: {channel}",
  },
  overwrite: {
    en: "Overwrite existing config?",
    zh: "是否覆盖现有配置?",
  },
  config_action: {
    en: "What would you like to do?",
    zh: "请选择操作：",
  },
  config_action_reconfigure: {
    en: "Reconfigure (edit current config, keep unchanged values)",
    zh: "重新配置（编辑当前配置，未修改项保持不变）",
  },
  config_action_overwrite: {
    en: "Overwrite (start fresh)",
    zh: "覆盖（从头开始配置）",
  },
  config_action_cancel: {
    en: "Cancel (keep current config)",
    zh: "取消（保留当前配置）",
  },
  setup_cancelled: {
    en: "Setup cancelled. Existing config preserved.",
    zh: "已取消。保留现有配置。",
  },
  checking: {
    en: "Checking prerequisites...",
    zh: "检查环境...",
  },
  node_ok: {
    en: "Node.js {version}",
    zh: "Node.js {version}",
  },
  node_need: {
    en: "Node.js >= 18 required",
    zh: "需要 Node.js >= 18",
  },
  cli_ok: {
    en: "Claude Code CLI found",
    zh: "Claude Code CLI 已安装",
  },
  cli_not_found: {
    en: "Claude Code CLI not found. Install: npm i -g @anthropic-ai/claude-code",
    zh: "未找到 Claude Code CLI。安装: npm i -g @anthropic-ai/claude-code",
  },
  checks_passed: {
    en: "All checks passed",
    zh: "所有检查通过",
  },
  checks_failed: {
    en: "Some checks failed. Please fix them before continuing.",
    zh: "部分检查未通过。请先修复以上问题。",
  },
  choose_channel: {
    en: "Choose channel(s) (space to select, enter to confirm)",
    zh: "选择通道（空格选择，回车确认）",
  },
  choose_channel_hint: {
    en: "You can select multiple channels to run simultaneously",
    zh: "可多选，同时启动多个通道",
  },
  channel_qq: {
    en: "QQ Bot (WebSocket, no public IP needed)",
    zh: "QQ 机器人 (WebSocket, 无需公网 IP)",
  },
  channel_wecom: {
    en: "WeChat Work (Webhook, needs public URL)",
    zh: "企业微信 (Webhook, 需要公网地址)",
  },
  // ── QQ Guide ──
  qq_title: {
    en: "QQ Bot Setup",
    zh: "QQ 机器人配置",
  },
  qq_guide: {
    en:
      "How to get your QQ Bot credentials:\n\n" +
      "1. Open QQ Bot Platform: https://q.qq.com/\n" +
      "2. Log in with your QQ account\n" +
      "3. Click 'Create Bot', fill in name and description\n" +
      "4. Go to 'Development' > 'Development Settings'\n" +
      "5. Find AppID and AppSecret on that page\n" +
      "   (AppSecret may need to click 'Reset' to reveal)\n\n" +
      "── After setup, how to use the bot ──\n\n" +
      "Bots are in SANDBOX MODE by default (no review needed).\n" +
      "You CANNOT search for the bot in QQ like a normal contact.\n\n" +
      "To add users who can chat with the bot:\n" +
      "1. Go to 'Development' > 'Sandbox Config' on q.qq.com\n" +
      "2. Add QQ numbers of yourself and friends (up to ~20)\n" +
      "3. A sandbox bot QR code / link will appear on that page\n" +
      "4. Scan the QR code with your phone QQ to start chatting\n\n" +
      "Note: In sandbox mode, the bot name will have a suffix\n" +
      "like 'YourBot-Testing'. This is added by QQ platform and\n" +
      "cannot be removed. It does NOT affect any functionality.\n" +
      "The suffix disappears after passing the review process.\n\n" +
      "For public use (unlimited users, no name suffix):\n" +
      "go through the review at 'Management' > 'Publish'.",
    zh:
      "如何获取 QQ 机器人凭证:\n\n" +
      "1. 打开 QQ 开放平台: https://q.qq.com/\n" +
      "2. 用你的 QQ 号登录\n" +
      "3. 点击「创建机器人」, 填写名称和简介\n" +
      "4. 进入「开发」>「开发设置」页面\n" +
      "5. 在页面上找到 AppID 和 AppSecret\n" +
      "   (AppSecret 可能需要点「重置」才能看到)\n\n" +
      "── 配置完成后, 如何使用机器人 ──\n\n" +
      "机器人默认为「沙箱模式」, 无需提审即可使用。\n" +
      "注意: 在 QQ 里搜索不到机器人, 必须通过以下方式添加:\n\n" +
      "1. 在 q.qq.com 进入「开发」>「沙箱配置」\n" +
      "2. 添加你自己和朋友的 QQ 号为测试用户 (最多约 20 人)\n" +
      "3. 页面上会出现沙箱机器人的二维码/链接\n" +
      "4. 用手机 QQ 扫码即可开始私聊\n\n" +
      "注意: 沙箱模式下, 机器人名字会带「测试中」后缀\n" +
      "(如「我的Bot-测试中」), 这是 QQ 平台强制添加的,\n" +
      "无法去掉, 但不影响任何功能。\n" +
      "通过审核后后缀会自动消失。\n\n" +
      "如需公开使用 (不限用户数, 无名称后缀):\n" +
      "在「管理」>「发布上架」提审。",
  },
  installing_qq_dep: {
    en: "Installing qq-group-bot...",
    zh: "正在安装 qq-group-bot...",
  },
  qq_dep_ok: {
    en: "qq-group-bot installed",
    zh: "qq-group-bot 安装完成",
  },
  qq_dep_fail: {
    en: "Failed to install qq-group-bot. Run manually: npm install -g qq-group-bot",
    zh: "qq-group-bot 安装失败。请手动运行: npm install -g qq-group-bot",
  },
  qq_appid: {
    en: "AppID",
    zh: "AppID",
  },
  qq_secret: {
    en: "AppSecret",
    zh: "AppSecret",
  },
  // ── WeCom Guide ──
  wecom_title: {
    en: "WeChat Work (WeCom) Setup",
    zh: "企业微信配置",
  },
  wecom_guide: {
    en:
      "How to get your WeCom credentials:\n\n" +
      "Step 1: Get Corp ID\n" +
      "  - Login: https://work.weixin.qq.com/wework_admin/loginpage_wx\n" +
      "  - Go to 'My Enterprise' at bottom of sidebar\n" +
      "  - Corp ID is at the bottom of that page\n\n" +
      "Step 2: Create App & Get Agent ID + Secret\n" +
      "  - Go to 'App Management' > 'Create App'\n" +
      "  - Set app name, logo, and visibility scope\n" +
      "  - After creation, find Agent ID and Secret on the app page\n" +
      "  - Secret may need to click 'View' and verify via admin's WeCom\n\n" +
      "Step 3: Set Callback URL\n" +
      "  - On app page, find 'Receive Messages' section\n" +
      "  - Click 'Set API Receive'\n" +
      "  - Enter your callback URL: https://<your-domain>/callback\n" +
      "  - Set a Token (any random string)\n" +
      "  - Set an EncodingAESKey (click 'Random' to generate)\n" +
      "  - Save — WeCom will verify the URL immediately\n\n" +
      "Tip: Use Cloudflare Tunnel for public URL:\n" +
      "  cloudflared tunnel --url http://localhost:8080",
    zh:
      "如何获取企业微信凭证:\n\n" +
      "第一步: 获取 Corp ID (企业 ID)\n" +
      "  - 登录管理后台: https://work.weixin.qq.com/wework_admin/loginpage_wx\n" +
      "  - 点击左侧边栏底部的「我的企业」\n" +
      "  - 页面最下方就是「企业 ID」\n\n" +
      "第二步: 创建应用, 获取 Agent ID 和 Secret\n" +
      "  - 进入「应用管理」>「创建应用」\n" +
      "  - 设置应用名称、图标、可见范围\n" +
      "  - 创建完成后, 在应用详情页找到 AgentId 和 Secret\n" +
      "  - Secret 可能需要点「查看」并通过管理员的企业微信验证\n\n" +
      "第三步: 设置回调地址\n" +
      "  - 在应用详情页找到「接收消息」板块\n" +
      "  - 点击「设置API接收」\n" +
      "  - 填入回调地址: https://<你的域名>/callback\n" +
      "  - 设置一个 Token (随意字符串即可)\n" +
      "  - 设置 EncodingAESKey (点「随机获取」自动生成)\n" +
      "  - 保存 — 企业微信会立即验证该地址\n\n" +
      "提示: 用 Cloudflare Tunnel 暴露本地端口到公网:\n" +
      "  cloudflared tunnel --url http://localhost:8080",
  },
  wecom_corp_id: {
    en: "Corp ID",
    zh: "企业 ID (Corp ID)",
  },
  wecom_secret: {
    en: "Corp Secret",
    zh: "应用 Secret",
  },
  wecom_agent_id: {
    en: "Agent ID",
    zh: "应用 ID (Agent ID)",
  },
  wecom_token: {
    en: "Callback Token",
    zh: "回调 Token",
  },
  wecom_aes_key: {
    en: "Encoding AES Key",
    zh: "EncodingAESKey",
  },
  wecom_port: {
    en: "Port (default 8080)",
    zh: "端口 (默认 8080)",
  },
  wecom_verify: {
    en: "Testing WeCom access_token...",
    zh: "测试企业微信 access_token...",
  },
  wecom_verify_ok: {
    en: "Access token obtained successfully!",
    zh: "access_token 获取成功!",
  },
  // ── Web Guide ──
  channel_web: {
    en: "Web Chat (Browser UI, localhost + optional Cloudflare Tunnel)",
    zh: "网页聊天 (浏览器 UI, 本地 + 可选 Cloudflare Tunnel 公网访问)",
  },
  web_title: {
    en: "Web Chat Setup",
    zh: "网页聊天配置",
  },
  web_guide: {
    en:
      "Web Chat provides a browser-based chat interface.\n\n" +
      "Features:\n" +
      "- Works on localhost by default\n" +
      "- Optional Cloudflare Tunnel for public access (no account needed)\n" +
      "- Token-based authentication\n" +
      "- Share the URL with your token to give others access\n\n" +
      "After setup, open the URL shown in terminal to start chatting.",
    zh:
      "网页聊天提供基于浏览器的聊天界面。\n\n" +
      "功能特点:\n" +
      "- 默认在本地运行\n" +
      "- 可选 Cloudflare Tunnel 公网访问 (无需账号)\n" +
      "- 基于 Token 认证\n" +
      "- 分享含 Token 的 URL 即可让他人访问\n\n" +
      "配置完成后，打开终端显示的 URL 即可开始聊天。",
  },
  web_token: {
    en: "Access Token (leave empty to auto-generate)",
    zh: "访问令牌 (留空自动生成)",
  },
  web_token_generated: {
    en: "Token auto-generated: {token}",
    zh: "已自动生成令牌: {token}",
  },
  web_port: {
    en: "Port (default 3000)",
    zh: "端口 (默认 3000)",
  },
  // ── Tunnel provider selection ──
  web_tunnel_mode: {
    en: "Choose tunnel mode for public access",
    zh: "选择公网访问隧道模式",
  },
  web_tunnel_none: {
    en: "None — localhost only",
    zh: "不启用 — 仅本地访问",
  },
  web_tunnel_quick: {
    en: "Cloudflare Quick Tunnel — random URL, no account needed",
    zh: "Cloudflare 快速隧道 — 随机 URL, 无需账号",
  },
  web_tunnel_named: {
    en: "Cloudflare Named Tunnel — fixed hostname via dashboard token",
    zh: "Cloudflare 命名隧道 — 通过 Dashboard Token 使用固定域名",
  },
  web_tunnel_ngrok: {
    en: "ngrok — free static domain available",
    zh: "ngrok — 支持免费静态域名",
  },
  web_tunnel_custom: {
    en: "Custom — your own URL + optional startup command",
    zh: "自定义 — 自行提供公网 URL + 可选启动命令",
  },
  // ── Cloudflare Named Tunnel ──
  web_tunnel_named_guide: {
    en:
      "Cloudflare Named Tunnel setup:\n\n" +
      "1. Open https://one.dash.cloudflare.com → Networks → Tunnels\n" +
      "2. Create a tunnel (e.g. 'klaus'), copy the connector token\n" +
      "3. In the tunnel's Routes tab → Add route → Published application:\n" +
      "   - Domain: your domain (e.g. chat.example.com)\n" +
      "   - Service Type: HTTP (not HTTPS!)\n" +
      "   - URL: localhost:PORT (e.g. localhost:3000)\n" +
      "4. Check your Cloudflare DNS panel — delete any old A records for this domain\n" +
      "   The tunnel will auto-create a CNAME record\n\n" +
      "The token looks like: eyJhIjoiNz...",
    zh:
      "Cloudflare 命名隧道配置:\n\n" +
      "1. 打开 https://one.dash.cloudflare.com → Networks → Tunnels\n" +
      "2. 创建隧道 (如 'klaus'), 复制 connector token\n" +
      "3. 在隧道的 Routes 标签页 → Add route → Published application:\n" +
      "   - Domain: 你的域名 (如 chat.example.com)\n" +
      "   - Service Type: 选 HTTP (不是 HTTPS!)\n" +
      "   - URL: localhost:端口 (如 localhost:3000)\n" +
      "4. 检查 Cloudflare DNS 面板 — 删除该域名的旧 A 记录\n" +
      "   隧道会自动创建 CNAME 记录\n\n" +
      "Token 格式如: eyJhIjoiNz...",
  },
  web_tunnel_cf_token: {
    en: "Cloudflare Tunnel connector token",
    zh: "Cloudflare Tunnel connector token",
  },
  web_tunnel_cf_hostname: {
    en: "Public hostname (optional, for display)",
    zh: "公网域名 (可选, 用于显示)",
  },
  web_cf_install_hint: {
    en:
      "  macOS: brew install cloudflared\n" +
      "  Other: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    zh:
      "  macOS: brew install cloudflared\n" +
      "  其他系统: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
  },
  // ── ngrok ──
  web_tunnel_ngrok_guide: {
    en:
      "ngrok setup:\n\n" +
      "1. Sign up at https://ngrok.com (free)\n" +
      "2. Get your auth token from https://dashboard.ngrok.com/get-started/your-authtoken\n" +
      "3. Optionally claim a free static domain at Endpoints → Domains",
    zh:
      "ngrok 配置:\n\n" +
      "1. 在 https://ngrok.com 注册 (免费)\n" +
      "2. 从 https://dashboard.ngrok.com/get-started/your-authtoken 获取 auth token\n" +
      "3. 可选: 在 Endpoints → Domains 领取免费静态域名",
  },
  web_tunnel_ngrok_authtoken: {
    en: "ngrok auth token",
    zh: "ngrok auth token",
  },
  web_tunnel_ngrok_domain: {
    en: "Static domain (optional, e.g. my-app.ngrok-free.app)",
    zh: "静态域名 (可选, 如 my-app.ngrok-free.app)",
  },
  web_ngrok_install_hint: {
    en: "  macOS: brew install ngrok\n  Other: https://ngrok.com/download",
    zh: "  macOS: brew install ngrok\n  其他系统: https://ngrok.com/download",
  },
  // ── Custom tunnel ──
  web_tunnel_custom_guide: {
    en:
      "Custom tunnel setup:\n\n" +
      "Provide your own public URL (e.g. https://chat.example.com).\n" +
      "Optionally, specify a command to start the tunnel (e.g. frpc, bore, etc.).\n" +
      "Klaus will run this command on startup and kill it on shutdown.",
    zh:
      "自定义隧道配置:\n\n" +
      "提供公网 URL (如 https://chat.example.com).\n" +
      "可选: 提供隧道启动命令 (如 frpc, bore 等).\n" +
      "Klaus 会在启动时运行此命令, 退出时自动关闭.",
  },
  web_tunnel_custom_url: {
    en: "Public URL",
    zh: "公网 URL",
  },
  web_tunnel_custom_command: {
    en: "Startup command (optional)",
    zh: "启动命令 (可选)",
  },
  // ── Binary detection (generic) ──
  web_binary_found: {
    en: "{cmd} found",
    zh: "已找到 {cmd}",
  },
  web_binary_not_found: {
    en: "{cmd} not found",
    zh: "未找到 {cmd}",
  },
  web_binary_auto_install: {
    en: "Run `{cmd}` to install automatically?",
    zh: "运行 `{cmd}` 自动安装?",
  },
  web_binary_installing: {
    en: "Installing {cmd}...",
    zh: "正在安装 {cmd}...",
  },
  web_binary_install_ok: {
    en: "{cmd} installed successfully",
    zh: "{cmd} 安装成功",
  },
  web_binary_install_fail: {
    en: "{cmd} installation failed. Please install manually.",
    zh: "{cmd} 安装失败, 请手动安装.",
  },
  validate_required: {
    en: "Required",
    zh: "必填",
  },
  validate_invalid_url: {
    en: "Must be a valid URL",
    zh: "必须是有效的 URL",
  },
  web_setup_done: {
    en: "Web Chat configured. URL will be shown when you run: klaus start",
    zh: "网页聊天已配置。运行 klaus start 后将显示访问 URL。",
  },
  // ── Persona ──
  persona_title: {
    en: "Bot Persona",
    zh: "机器人人设",
  },
  persona_method: {
    en: "How do you want to set the persona?",
    zh: "如何设置人设?",
  },
  persona_from_clipboard: {
    en: "Paste from clipboard (recommended — copy text first, then select this)",
    zh: "从剪贴板粘贴 (推荐 — 先复制内容，再选此项)",
  },
  persona_clipboard_preview: {
    en: "Clipboard content preview:",
    zh: "剪贴板内容预览:",
  },
  persona_clipboard_confirm: {
    en: "Use this as persona?",
    zh: "使用这段内容作为人设?",
  },
  persona_clipboard_empty: {
    en: "Clipboard is empty. Skipping persona.",
    zh: "剪贴板为空，跳过人设设置。",
  },
  persona_lines: {
    en: "lines",
    zh: "行",
  },
  persona_from_file: {
    en: "From file",
    zh: "从文件读取",
  },
  persona_direct: {
    en: "Type directly (single line only)",
    zh: "直接输入 (仅支持单行)",
  },
  persona_skip_option: {
    en: "Skip (use default Claude behavior)",
    zh: "跳过 (使用默认 Claude 行为)",
  },
  persona_keep: {
    en: "Keep current persona (no change)",
    zh: "保留当前人设（不修改）",
  },
  persona_file_prompt: {
    en: "Path to persona file (text/markdown)",
    zh: "人设文件路径 (文本或 Markdown 文件)",
  },
  persona_file_required: {
    en: "File path is required",
    zh: "请输入文件路径",
  },
  persona_file_not_found: {
    en: "File not found",
    zh: "文件不存在",
  },
  persona_prompt: {
    en: "Enter system prompt (single line)",
    zh: "输入 system prompt (单行)",
  },
  persona_placeholder: {
    en: "You are a helpful AI assistant...",
    zh: "你是一个友好的 AI 助手...",
  },
  persona_saved: {
    en: "Persona configured",
    zh: "人设已配置",
  },
  persona_skipped: {
    en: "Using default Claude behavior",
    zh: "使用默认 Claude 行为",
  },
  qq_verify_ok: {
    en: "Credentials saved (will verify on first start)",
    zh: "凭证已保存 (将在首次启动时验证)",
  },
  // ── Chat Commands ──
  cmd_reset: {
    en: "Session reset.",
    zh: "会话已重置。",
  },
  cmd_help: {
    en:
      "Available commands:\n" +
      "/new /reset /clear — Reset conversation\n" +
      "/help — Show this help\n" +
      "/session — Show session info\n" +
      "/model — Show current model\n" +
      "/model <name> — Switch model (sonnet/opus/haiku)\n" +
      "/skills — Show enabled skills\n" +
      "/cron — Scheduled tasks (list/run/add/edit/remove/status)",
    zh:
      "可用命令:\n" +
      "/new /reset /clear — 重置对话\n" +
      "/help — 显示帮助\n" +
      "/session — 查看会话信息\n" +
      "/model — 查看当前模型\n" +
      "/model <名称> — 切换模型 (sonnet/opus/haiku)\n" +
      "/skills — 查看已启用的技能\n" +
      "/cron — 定时任务 (列表/触发/添加/编辑/删除/状态)",
  },
  cmd_session_info: {
    en: "Session: {key}\nStatus: {status}\nModel: {model}",
    zh: "会话: {key}\n状态: {status}\n模型: {model}",
  },
  cmd_session_active: {
    en: "active",
    zh: "活跃",
  },
  cmd_session_idle: {
    en: "idle",
    zh: "空闲",
  },
  cmd_model_current: {
    en: "Current model: {model}",
    zh: "当前模型: {model}",
  },
  cmd_model_switched: {
    en: "Model switched to: {model}",
    zh: "模型已切换为: {model}",
  },
  cmd_model_unknown: {
    en: "Unknown model: {name}\nAvailable: sonnet, opus, haiku",
    zh: "未知模型: {name}\n可选: sonnet, opus, haiku",
  },
  cmd_default_model: {
    en: "default",
    zh: "默认",
  },
  cmd_skills_list: {
    en: "Enabled skills ({count}):\n{list}\n\nSkills are auto-gated by binary/env presence.\nUser overrides: ~/.klaus/skills/<name>/SKILL.md",
    zh: "已启用的技能 ({count}):\n{list}\n\n技能会根据二进制/环境变量自动判断可用性。\n用户自定义: ~/.klaus/skills/<name>/SKILL.md",
  },
  // ── Cron Commands ──
  cmd_cron_disabled: {
    en: 'Cron is not enabled.\n\nTo enable, add to ~/.klaus/config.yaml:\n\ncron:\n  enabled: true\n  tasks:\n    - id: daily-summary\n      schedule: "0 9 * * *"\n      prompt: "Summarize recent events"',
    zh: '定时任务未启用。\n\n在 ~/.klaus/config.yaml 中添加:\n\ncron:\n  enabled: true\n  tasks:\n    - id: daily-summary\n      schedule: "0 9 * * *"\n      prompt: "总结近期事件"',
  },
  cmd_cron_empty: {
    en: "No cron tasks configured.",
    zh: "未配置任何定时任务。",
  },
  cmd_cron_list: {
    en: "Cron tasks ({count}):\n{list}",
    zh: "定时任务 ({count}):\n{list}",
  },
  cmd_cron_help: {
    en:
      "Cron commands:\n" +
      "/cron — List all tasks\n" +
      "/cron status — Scheduler status\n" +
      "/cron run <id> — Trigger task now\n" +
      "/cron runs <id> — View run history\n" +
      "/cron add <id> <schedule> <prompt> — Add task\n" +
      "/cron edit <id> <field>=<value> — Edit task\n" +
      "/cron remove <id> — Remove task\n" +
      "/cron enable <id> — Enable task\n" +
      "/cron disable <id> — Disable task",
    zh:
      "定时任务命令:\n" +
      "/cron — 列出所有任务\n" +
      "/cron status — 调度器状态\n" +
      "/cron run <id> — 立即触发任务\n" +
      "/cron runs <id> — 查看运行历史\n" +
      "/cron add <id> <schedule> <prompt> — 添加任务\n" +
      "/cron edit <id> <字段>=<值> — 编辑任务\n" +
      "/cron remove <id> — 删除任务\n" +
      "/cron enable <id> — 启用任务\n" +
      "/cron disable <id> — 禁用任务",
  },
  cmd_cron_added: {
    en: 'Task "{id}" added.\nSchedule: {schedule}\nPrompt: {prompt}',
    zh: '任务 "{id}" 已添加。\n调度: {schedule}\n提示: {prompt}',
  },
  cmd_cron_edited: {
    en: 'Task "{id}" updated.',
    zh: '任务 "{id}" 已更新。',
  },
  cmd_cron_removed: {
    en: 'Task "{id}" removed.',
    zh: '任务 "{id}" 已删除。',
  },
  cmd_cron_not_found: {
    en: 'Task "{id}" not found.',
    zh: '未找到任务 "{id}"。',
  },
  cmd_cron_triggered: {
    en: 'Task "{id}" triggered. Status: {status}',
    zh: '任务 "{id}" 已触发。状态: {status}',
  },
  cmd_cron_runs_header: {
    en: "Run history for {id} (last {count}):\n{list}",
    zh: "{id} 的运行历史 (最近 {count} 条):\n{list}",
  },
  cmd_cron_runs_empty: {
    en: 'No runs recorded for "{id}".',
    zh: '任务 "{id}" 暂无运行记录。',
  },
  cmd_cron_status: {
    en: "Scheduler: {state}\nTasks: {total} total, {active} active\nNext wake: {next}",
    zh: "调度器: {state}\n任务: 共 {total} 个, {active} 个活跃\n下次触发: {next}",
  },
  cmd_cron_enabled: {
    en: 'Task "{id}" enabled.',
    zh: '任务 "{id}" 已启用。',
  },
  cmd_cron_disabled_task: {
    en: 'Task "{id}" disabled.',
    zh: '任务 "{id}" 已禁用。',
  },
  cmd_skills_none: {
    en: "No skills enabled.\n\nAvailable: {available}\n\nEnable in ~/.klaus/config.yaml:\n  skills: all\n  # or list specific skills:\n  skills:\n    - video-frames\n    - xurl\n\nSkills require their CLI tools installed (auto-gated).",
    zh: "未启用任何技能。\n\n可用: {available}\n\n在 ~/.klaus/config.yaml 中启用:\n  skills: all\n  # 或指定具体技能:\n  skills:\n    - video-frames\n    - xurl\n\n技能需要相应 CLI 工具已安装（自动检测）。",
  },
  // ── Done ──
  config_saved: {
    en: "Config saved to {path}",
    zh: "配置已保存到 {path}",
  },
  setup_done: {
    en: "Setup complete! Run: klaus start",
    zh: "安装完成! 运行: klaus start",
  },
};

let currentLang: Lang = "en";

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string, vars?: Record<string, string>): string {
  let text = TEXTS[key]?.[currentLang] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}
