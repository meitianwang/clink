"""Interactive setup wizard for Clink (multi-language)."""

from __future__ import annotations

import asyncio
import shutil
import subprocess
import sys

from config import CONFIG_FILE, load_config, save_config

# ── i18n ────────────────────────────────────

TEXTS: dict[str, dict[str, str]] = {
    "lang_prompt": {
        "en": "Choose language / 选择语言:\n\n  1. English\n  2. 中文\n",
        "zh": "Choose language / 选择语言:\n\n  1. English\n  2. 中文\n",
    },
    "lang_invalid": {
        "en": "  Please enter 1 or 2.",
        "zh": "  请输入 1 或 2。",
    },
    "setup_title": {
        "en": "Clink Setup",
        "zh": "Clink 安装引导",
    },
    "config_exists": {
        "en": "  Config already exists: {path}\n  Current channel: {channel}\n",
        "zh": "  配置文件已存在: {path}\n  当前通道: {channel}\n",
    },
    "overwrite": {
        "en": "  Overwrite? [y/N]: ",
        "zh": "  是否覆盖? [y/N]: ",
    },
    "setup_cancelled": {
        "en": "\n  Setup cancelled. Existing config preserved.",
        "zh": "\n  已取消。保留现有配置。",
    },
    "checking": {
        "en": "Checking prerequisites...\n",
        "zh": "检查环境...\n",
    },
    "py_need": {
        "en": "need >= 3.10",
        "zh": "需要 >= 3.10",
    },
    "cli_not_found": {
        "en": "not found — install: npm i -g @anthropic-ai/claude-code",
        "zh": "未找到 — 安装: npm i -g @anthropic-ai/claude-code",
    },
    "missing_pkg": {
        "en": "\n  ✗ Missing packages: {pkgs}\n  Installing...",
        "zh": "\n  ✗ 缺少依赖: {pkgs}\n  正在安装...",
    },
    "all_pkg_ok": {
        "en": "All pip packages installed",
        "zh": "所有 pip 依赖已就绪",
    },
    "fix_and_rerun": {
        "en": "Please fix the issues above and re-run setup.",
        "zh": "请修复以上问题后重新运行 setup。",
    },
    "choose_channel": {
        "en": "Choose a channel:\n",
        "zh": "选择通道:\n",
    },
    "channel_terminal": {
        "en": "Local terminal (no setup needed)",
        "zh": "本地终端 (无需配置)",
    },
    "channel_qq": {
        "en": "QQ Bot (WebSocket, no public IP needed)",
        "zh": "QQ 机器人 (WebSocket, 无需公网 IP)",
    },
    "channel_wecom": {
        "en": "WeChat Work (Webhook, needs public URL)",
        "zh": "企业微信 (Webhook, 需要公网地址)",
    },
    "enter_number": {
        "en": "  Please enter a number 1-3.",
        "zh": "  请输入 1-3 的数字。",
    },
    # ── QQ Guide ──
    "qq_title": {
        "en": "QQ Bot Setup",
        "zh": "QQ 机器人配置",
    },
    "qq_guide": {
        "en": (
            "  How to get your QQ Bot credentials:\n\n"
            "  1. Open QQ Bot Platform: https://q.qq.com/\n"
            "  2. Log in with your QQ account\n"
            "  3. Click 'Create Bot', fill in name and description\n"
            "  4. Go to 'Development' > 'Development Settings'\n"
            "  5. Find AppID and AppSecret on that page\n"
            "     (AppSecret may need to click 'Reset' to reveal)\n\n"
            "  ── After setup, how to use the bot ──\n\n"
            "  Bots are in SANDBOX MODE by default (no review needed).\n"
            "  You CANNOT search for the bot in QQ like a normal contact.\n\n"
            "  To add users who can chat with the bot:\n"
            "  1. Go to 'Development' > 'Sandbox Config' on q.qq.com\n"
            "  2. Add QQ numbers of yourself and friends (up to ~20)\n"
            "  3. A sandbox bot QR code / link will appear on that page\n"
            "  4. Scan the QR code with your phone QQ to start chatting\n\n"
            "  Note: In sandbox mode, the bot name will have a suffix\n"
            "  like 'YourBot-Testing'. This is added by QQ platform and\n"
            "  cannot be removed. It does NOT affect any functionality.\n"
            "  The suffix disappears after passing the review process.\n\n"
            "  For public use (unlimited users, no name suffix):\n"
            "  go through the review at 'Management' > 'Publish'.\n"
        ),
        "zh": (
            "  如何获取 QQ 机器人凭证:\n\n"
            "  1. 打开 QQ 开放平台: https://q.qq.com/\n"
            "  2. 用你的 QQ 号登录\n"
            "  3. 点击「创建机器人」, 填写名称和简介\n"
            "  4. 进入「开发」>「开发设置」页面\n"
            "  5. 在页面上找到 AppID 和 AppSecret\n"
            "     (AppSecret 可能需要点「重置」才能看到)\n\n"
            "  ── 配置完成后, 如何使用机器人 ──\n\n"
            "  机器人默认为「沙箱模式」, 无需提审即可使用。\n"
            "  注意: 在 QQ 里搜索不到机器人, 必须通过以下方式添加:\n\n"
            "  1. 在 q.qq.com 进入「开发」>「沙箱配置」\n"
            "  2. 添加你自己和朋友的 QQ 号为测试用户 (最多约 20 人)\n"
            "  3. 页面上会出现沙箱机器人的二维码/链接\n"
            "  4. 用手机 QQ 扫码即可开始私聊\n\n"
            "  注意: 沙箱模式下, 机器人名字会带「测试中」后缀\n"
            "  (如「我的Bot-测试中」), 这是 QQ 平台强制添加的,\n"
            "  无法去掉, 但不影响任何功能。\n"
            "  通过审核后后缀会自动消失。\n\n"
            "  如需公开使用 (不限用户数, 无名称后缀):\n"
            "  在「管理」>「发布上架」提审。\n"
        ),
    },
    "qq_appid": {
        "en": "  AppID: ",
        "zh": "  AppID: ",
    },
    "qq_secret": {
        "en": "  AppSecret: ",
        "zh": "  AppSecret: ",
    },
    "qq_verify": {
        "en": "\n  Testing QQ Bot connection... ",
        "zh": "\n  测试 QQ 机器人连接... ",
    },
    "qq_verify_ok": {
        "en": "✓ Credentials saved (will verify on first start)",
        "zh": "✓ 凭证已保存 (将在首次启动时验证)",
    },
    # ── WeCom Guide ──
    "wecom_title": {
        "en": "WeChat Work (WeCom) Setup",
        "zh": "企业微信配置",
    },
    "wecom_guide": {
        "en": (
            "  How to get your WeCom credentials:\n\n"
            "  Step 1: Get Corp ID\n"
            "    - Login: https://work.weixin.qq.com/wework_admin/loginpage_wx\n"
            "    - Go to 'My Enterprise' at bottom of sidebar\n"
            "    - Corp ID is at the bottom of that page\n\n"
            "  Step 2: Create App & Get Agent ID + Secret\n"
            "    - Go to 'App Management' > 'Create App'\n"
            "    - Set app name, logo, and visibility scope\n"
            "    - After creation, find Agent ID and Secret on the app page\n"
            "    - Secret may need to click 'View' and verify via admin's WeCom\n\n"
            "  Step 3: Set Callback URL\n"
            "    - On app page, find 'Receive Messages' section\n"
            "    - Click 'Set API Receive'\n"
            "    - Enter your callback URL: https://<your-domain>/callback\n"
            "    - Set a Token (any random string)\n"
            "    - Set an EncodingAESKey (click 'Random' to generate)\n"
            "    - Save — WeCom will verify the URL immediately\n\n"
            "  Tip: Use Cloudflare Tunnel for public URL:\n"
            "    cloudflared tunnel --url http://localhost:8080\n"
        ),
        "zh": (
            "  如何获取企业微信凭证:\n\n"
            "  第一步: 获取 Corp ID (企业 ID)\n"
            "    - 登录管理后台: https://work.weixin.qq.com/wework_admin/loginpage_wx\n"
            "    - 点击左侧边栏底部的「我的企业」\n"
            "    - 页面最下方就是「企业 ID」\n\n"
            "  第二步: 创建应用, 获取 Agent ID 和 Secret\n"
            "    - 进入「应用管理」>「创建应用」\n"
            "    - 设置应用名称、图标、可见范围\n"
            "    - 创建完成后, 在应用详情页找到 AgentId 和 Secret\n"
            "    - Secret 可能需要点「查看」并通过管理员的企业微信验证\n\n"
            "  第三步: 设置回调地址\n"
            "    - 在应用详情页找到「接收消息」板块\n"
            "    - 点击「设置API接收」\n"
            "    - 填入回调地址: https://<你的域名>/callback\n"
            "    - 设置一个 Token (随意字符串即可)\n"
            "    - 设置 EncodingAESKey (点「随机获取」自动生成)\n"
            "    - 保存 — 企业微信会立即验证该地址\n\n"
            "  提示: 用 Cloudflare Tunnel 暴露本地端口到公网:\n"
            "    cloudflared tunnel --url http://localhost:8080\n"
        ),
    },
    "wecom_corp_id": {
        "en": "  Corp ID: ",
        "zh": "  企业 ID (Corp ID): ",
    },
    "wecom_secret": {
        "en": "  Corp Secret: ",
        "zh": "  应用 Secret (Corp Secret): ",
    },
    "wecom_agent_id": {
        "en": "  Agent ID: ",
        "zh": "  应用 ID (Agent ID): ",
    },
    "wecom_token": {
        "en": "  Callback Token: ",
        "zh": "  回调 Token: ",
    },
    "wecom_aes_key": {
        "en": "  Encoding AES Key: ",
        "zh": "  EncodingAESKey: ",
    },
    "wecom_port": {
        "en": "  Port [8080]: ",
        "zh": "  端口 [8080]: ",
    },
    "wecom_verify": {
        "en": "\n  Testing WeCom access_token... ",
        "zh": "\n  测试企业微信 access_token... ",
    },
    "wecom_verify_ok": {
        "en": "✓ Access token obtained successfully!",
        "zh": "✓ access_token 获取成功!",
    },
    "save_anyway": {
        "en": "\n  Save config anyway? [y/N]: ",
        "zh": "\n  仍然保存配置? [y/N]: ",
    },
    "cancelled": {
        "en": "\n  Setup cancelled.",
        "zh": "\n  已取消安装。",
    },
    "config_saved": {
        "en": "\n  Config saved to {path}",
        "zh": "\n  配置已保存到 {path}",
    },
    "setup_done": {
        "en": "  ✓ Setup complete! Run:\n\n    python clink.py start",
        "zh": "  ✓ 安装完成! 运行:\n\n    python clink.py start",
    },
    # ── Persona ──
    "persona_title": {
        "en": "Bot Persona",
        "zh": "机器人人设",
    },
    "persona_prompt": {
        "en": (
            "  Set the bot's system prompt (controls how it responds).\n"
            "  You can paste multiple lines. Press Enter twice to finish.\n"
            "  Leave empty to use default Claude behavior.\n"
        ),
        "zh": (
            "  设置机器人的 system prompt (控制回复风格和角色)。\n"
            "  支持粘贴多行文本, 连按两次回车结束输入。\n"
            "  留空则使用默认 Claude 行为。\n"
        ),
    },
    "persona_saved": {
        "en": "  ✓ Persona configured",
        "zh": "  ✓ 人设已配置",
    },
    "persona_skipped": {
        "en": "  ✓ Using default Claude behavior",
        "zh": "  ✓ 使用默认 Claude 行为",
    },
}

# Current language — set by choose_language()
_lang = "en"


def t(key: str, **kwargs: str) -> str:
    """Get translated text for current language."""
    text = TEXTS.get(key, {}).get(_lang, key)
    if kwargs:
        text = text.format(**kwargs)
    return text


# ── Helpers ─────────────────────────────────

def _print_header(title: str) -> None:
    width = max(len(title) + 4, 40)
    print(f"\n{'─' * width}")
    print(f"  {title}")
    print(f"{'─' * width}\n")


def _check(label: str, ok: bool, detail: str = "") -> bool:
    mark = "✓" if ok else "✗"
    suffix = f" ({detail})" if detail else ""
    print(f"  {mark} {label}{suffix}")
    return ok


_PKG_IMPORT_MAP = {
    "pyyaml": "yaml",
    "qq-botpy": "botpy",
    "claude-agent-sdk": "claude_agent_sdk",
}


def _check_packages() -> list[str]:
    """Return list of missing required packages."""
    requirements_file = __import__("pathlib").Path(__file__).parent / "requirements.txt"
    if not requirements_file.exists():
        return []

    required: list[str] = []
    for line in requirements_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            required.append(line)

    missing: list[str] = []
    for pkg in required:
        import_name = _PKG_IMPORT_MAP.get(pkg, pkg.replace("-", "_"))
        try:
            __import__(import_name)
        except ImportError:
            missing.append(pkg)
    return missing


# ── Steps ───────────────────────────────────

def choose_language() -> None:
    """Let user pick a language."""
    global _lang
    print(TEXTS["lang_prompt"]["en"])
    while True:
        choice = input("  > ").strip()
        if choice == "1":
            _lang = "en"
            return
        if choice == "2":
            _lang = "zh"
            return
        print(TEXTS["lang_invalid"]["en"])


def check_prerequisites() -> bool:
    """Check Python version and Claude CLI availability."""
    print(t("checking"))

    v = sys.version_info
    py_ok = v >= (3, 10)
    _check(f"Python {v.major}.{v.minor}.{v.micro}", py_ok,
           t("py_need") if not py_ok else "")

    claude_path = shutil.which("claude")
    claude_ok = claude_path is not None
    _check("Claude Code CLI", claude_ok,
           claude_path if claude_ok else t("cli_not_found"))

    missing = _check_packages()
    if missing:
        print(t("missing_pkg", pkgs=", ".join(missing)), end=" ", flush=True)
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-q"] + missing,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print("done." if _lang == "en" else "完成。")
    else:
        _check(t("all_pkg_ok"), True)

    print()
    return py_ok and claude_ok


def choose_channel() -> str:
    """Let user pick a channel."""
    channels = [
        ("terminal", t("channel_terminal")),
        ("qq", t("channel_qq")),
        ("wecom", t("channel_wecom")),
    ]
    print(t("choose_channel"))
    for i, (name, desc) in enumerate(channels, 1):
        print(f"  {i}. {name:10s} - {desc}")

    while True:
        choice = input("\n  > ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(channels):
            return channels[int(choice) - 1][0]
        print(t("enter_number"))


def collect_config(channel: str) -> dict:
    """Collect channel-specific config via interactive prompts."""
    if channel == "terminal":
        return {}

    if channel == "qq":
        _print_header(t("qq_title"))
        print(t("qq_guide"))
        appid = input(t("qq_appid")).strip()
        secret = input(t("qq_secret")).strip()
        return {"appid": appid, "secret": secret}

    if channel == "wecom":
        _print_header(t("wecom_title"))
        print(t("wecom_guide"))
        corp_id = input(t("wecom_corp_id")).strip()
        corp_secret = input(t("wecom_secret")).strip()
        while True:
            agent_id = input(t("wecom_agent_id")).strip()
            try:
                agent_id_int = int(agent_id)
                break
            except ValueError:
                print("  " + ("Please enter a number." if _lang == "en" else "请输入数字。"))
        token = input(t("wecom_token")).strip()
        aes_key = input(t("wecom_aes_key")).strip()
        port_str = input(t("wecom_port")).strip() or "8080"
        try:
            port_int = int(port_str)
        except ValueError:
            port_int = 8080
        return {
            "corp_id": corp_id,
            "corp_secret": corp_secret,
            "agent_id": agent_id_int,
            "token": token,
            "encoding_aes_key": aes_key,
            "port": port_int,
        }

    return {}


def collect_persona() -> str | None:
    """Let user enter a (possibly multi-line) system prompt for the bot."""
    _print_header(t("persona_title"))
    print(t("persona_prompt"))

    lines: list[str] = []
    try:
        while True:
            line = input("  > " if not lines else "    ")
            if line == "" and (not lines or lines[-1] == ""):
                # Two consecutive empty lines, or empty on first line → done
                break
            lines.append(line)
    except EOFError:
        pass

    # Remove trailing empty lines
    while lines and lines[-1] == "":
        lines.pop()

    persona = "\n".join(lines).strip()
    if persona:
        print(f"\n{t('persona_saved')}")
        return persona
    print(f"\n{t('persona_skipped')}")
    return None


def verify_connection(channel: str, channel_cfg: dict) -> bool:
    """Try connecting to the channel to verify credentials."""
    if channel == "terminal":
        return True

    if channel == "qq":
        print(t("qq_verify"), end="", flush=True)
        try:
            import botpy  # noqa: F401
            print(t("qq_verify_ok"))
            return True
        except Exception as exc:
            print(f"✗ {exc}")
            return False

    if channel == "wecom":
        print(t("wecom_verify"), end="", flush=True)
        try:
            ok = asyncio.run(_test_wecom_token(
                channel_cfg["corp_id"], channel_cfg["corp_secret"]
            ))
            if ok:
                print(t("wecom_verify_ok"))
            return ok
        except Exception as exc:
            print(f"✗ {exc}")
            return False

    return True


async def _test_wecom_token(corp_id: str, corp_secret: str) -> bool:
    """Try to get a WeCom access token to verify credentials."""
    import aiohttp

    url = "https://qyapi.weixin.qq.com/cgi-bin/gettoken"
    params = {"corpid": corp_id, "corpsecret": corp_secret}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            data = await resp.json()
    if data.get("errcode", 0) != 0:
        print(f"✗ API error: {data.get('errmsg', 'unknown')}")
        return False
    return True


# ── Main ────────────────────────────────────

def run_setup() -> None:
    """Main setup wizard entry point."""
    _print_header("Clink Setup")

    # Step 0: Choose language
    choose_language()

    # Check if config already exists
    if CONFIG_FILE.exists():
        existing = load_config()
        ch = existing.get("channel", "unknown")
        print(t("config_exists", path=str(CONFIG_FILE), channel=ch))
        overwrite = input(t("overwrite")).strip().lower()
        if overwrite != "y":
            print(t("setup_cancelled"))
            return

    # Step 1: Prerequisites
    if not check_prerequisites():
        print(t("fix_and_rerun"))
        return

    # Step 2: Choose channel
    channel = choose_channel()

    # Step 3: Collect config
    channel_cfg = collect_config(channel)

    # Step 4: Verify connection
    if channel_cfg:
        if not verify_connection(channel, channel_cfg):
            save_anyway = input(t("save_anyway")).strip().lower()
            if save_anyway != "y":
                print(t("cancelled"))
                return

    # Step 5: Bot persona
    persona = collect_persona()

    # Step 6: Save config
    config_data = {"channel": channel}
    if channel_cfg:
        config_data[channel] = channel_cfg
    if persona:
        config_data["persona"] = persona

    save_config(config_data)
    print(t("config_saved", path=str(CONFIG_FILE)))

    print(f"\n{'─' * 40}")
    print(t("setup_done"))
    print()
