from __future__ import annotations

import asyncio

from channels.base import Channel, Handler


class TerminalChannel(Channel):
    """终端通道：stdin 输入，stdout 输出。"""

    async def start(self, handler: Handler) -> None:
        print("Clink ready. Type your message (Ctrl+C to quit, /new to reset).\n")
        loop = asyncio.get_running_loop()
        try:
            while True:
                try:
                    user_input = await loop.run_in_executor(None, lambda: input("You: "))
                except EOFError:
                    break

                text = user_input.strip()
                if not text:
                    continue

                try:
                    reply = await handler("terminal", text)
                except Exception as exc:
                    print(f"\n[Error] {exc}\n")
                    continue

                if reply is not None:
                    print(f"\nClink: {reply}\n")
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass
        print("\nBye!")
