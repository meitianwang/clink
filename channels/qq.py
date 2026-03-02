"""QQ 机器人通道：通过官方 qq-botpy SDK WebSocket 接收私聊消息。"""

from __future__ import annotations

import asyncio

import botpy
from botpy.message import C2CMessage, GroupMessage

from channels.base import Channel, Handler
from config import QQBotConfig


class QQChannel(Channel):
    """QQ Bot 通道（WebSocket，不需要公网 IP）。"""

    def __init__(self) -> None:
        self._cfg = QQBotConfig.from_config()

    async def start(self, handler: Handler) -> None:
        print("Clink QQ Bot channel starting...")

        client = _make_client(handler)
        await client.start(appid=self._cfg.appid, secret=self._cfg.secret)


def _make_client(handler: Handler) -> botpy.Client:
    """Create a botpy.Client wired to our handler."""

    class _Bot(botpy.Client):

        async def on_ready(self):
            print(f"Clink QQ Bot online: {self.robot.name}")

        async def on_c2c_message_create(self, message: C2CMessage):
            """收到 QQ 私聊消息。"""
            content = (message.content or "").strip()
            if not content:
                return

            try:
                reply = await handler(content)
            except Exception as exc:
                reply = f"[Error] {exc}"

            await message._api.post_c2c_message(
                openid=message.author.user_openid,
                msg_type=0,
                msg_id=message.id,
                content=reply,
            )

        async def on_group_at_message_create(self, message: GroupMessage):
            """收到 QQ 群 @Bot 消息。"""
            content = (message.content or "").strip()
            if not content:
                return

            try:
                reply = await handler(content)
            except Exception as exc:
                reply = f"[Error] {exc}"

            await message._api.post_group_message(
                group_openid=message.group_openid,
                msg_type=0,
                msg_id=message.id,
                content=reply,
            )

    return _Bot(intents=botpy.Intents(direct_message=True))
