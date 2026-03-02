"""Clink: minimal Claude Code multi-channel wrapper.

Usage:
    python clink.py setup    # Interactive setup wizard
    python clink.py start    # Start the bot (default)
    python clink.py doctor   # Diagnose environment issues
"""

import asyncio
import sys

from channels.terminal import TerminalChannel
from channels.wecom import WeComChannel
from channels.qq import QQChannel
from config import get_channel_name
from core import ChatSessionManager

CHANNELS = {
    "terminal": TerminalChannel,
    "wecom": WeComChannel,
    "qq": QQChannel,
}


async def start() -> None:
    """Start the bot using the configured channel."""
    channel_name = get_channel_name()
    channel_cls = CHANNELS.get(channel_name)

    if channel_cls is None:
        print(f"Unknown channel: {channel_name}")
        print(f"Available: {', '.join(CHANNELS)}")
        print("Run 'python clink.py setup' to configure.")
        sys.exit(1)

    sessions = ChatSessionManager()
    channel = channel_cls()

    async def handler(session_key: str, text: str) -> str | None:
        if text in ("/new", "/reset", "/clear"):
            await sessions.reset(session_key)
            return "Session reset."
        return await sessions.chat(session_key, text)

    try:
        await channel.start(handler)
    finally:
        await sessions.close()


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "start"

    if cmd == "setup":
        from setup_wizard import run_setup
        run_setup()
    elif cmd == "doctor":
        from doctor import run_doctor
        run_doctor()
    elif cmd == "start":
        asyncio.run(start())
    else:
        print(__doc__.strip())
        sys.exit(1)


if __name__ == "__main__":
    main()
