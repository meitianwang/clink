type Lang = "en" | "zh";

const TEXTS: Record<string, Record<Lang, string>> = {
  // ── Setup ──
  setup_title: {
    en: " Klaus Setup ",
    zh: " Klaus 安装引导 ",
  },
  config_exists: {
    en: "Config already exists at {path}\nCurrent channel: {channel}",
    zh: "配置文件已存在: {path}\n当前通道: {channel}",
  },
  overwrite: {
    en: "Overwrite existing config?",
    zh: "是否覆盖现有配置?",
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
    en: "Choose a channel",
    zh: "选择通道",
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
  web_tunnel: {
    en: "Enable Cloudflare Tunnel for public access?",
    zh: "启用 Cloudflare Tunnel 以支持公网访问?",
  },
  web_tunnel_found: {
    en: "cloudflared found",
    zh: "已找到 cloudflared",
  },
  web_tunnel_not_found: {
    en: "cloudflared not found",
    zh: "未找到 cloudflared",
  },
  web_tunnel_install: {
    en: "Install cloudflared automatically?",
    zh: "自动安装 cloudflared?",
  },
  web_tunnel_installing: {
    en: "Installing cloudflared...",
    zh: "正在安装 cloudflared...",
  },
  web_tunnel_install_ok: {
    en: "cloudflared installed successfully",
    zh: "cloudflared 安装成功",
  },
  web_tunnel_install_fail: {
    en:
      "cloudflared installation failed. Please install manually:\n" +
      "  macOS: brew install cloudflared\n" +
      "  Other: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    zh:
      "cloudflared 安装失败，请手动安装:\n" +
      "  macOS: brew install cloudflared\n" +
      "  其他系统: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
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
      "/model <name> — Switch model (sonnet/opus/haiku)",
    zh:
      "可用命令:\n" +
      "/new /reset /clear — 重置对话\n" +
      "/help — 显示帮助\n" +
      "/session — 查看会话信息\n" +
      "/model — 查看当前模型\n" +
      "/model <名称> — 切换模型 (sonnet/opus/haiku)",
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
