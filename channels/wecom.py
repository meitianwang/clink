"""企业微信通道：通过 Webhook 回调接收消息，API 发送回复。"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import socket
import struct
import time
import xml.etree.ElementTree as ET

import aiohttp
from aiohttp import web
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.padding import PKCS7

from channels.base import Channel, Handler
from config import WeComConfig


class WeComChannel(Channel):
    """企业微信自建应用通道。"""

    def __init__(self) -> None:
        self._cfg = WeComConfig.from_config()
        self._aes_key = base64.b64decode(self._cfg.encoding_aes_key + "=")
        self._handler: Handler | None = None
        # access_token cache
        self._token: str = ""
        self._token_expires_at: float = 0

    # ------------------------------------------------------------------
    # Channel interface
    # ------------------------------------------------------------------

    async def start(self, handler: Handler) -> None:
        self._handler = handler
        app = web.Application()
        app.router.add_get("/callback", self._on_verify)
        app.router.add_post("/callback", self._on_message)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", self._cfg.port)
        print(f"Clink WeCom channel listening on :{self._cfg.port}/callback")
        await site.start()

        # Block forever
        await asyncio.Event().wait()

    # ------------------------------------------------------------------
    # Callback: URL verification (GET)
    # ------------------------------------------------------------------

    async def _on_verify(self, request: web.Request) -> web.Response:
        """企业微信回调 URL 验证。"""
        msg_signature = request.query.get("msg_signature", "")
        timestamp = request.query.get("timestamp", "")
        nonce = request.query.get("nonce", "")
        echostr = request.query.get("echostr", "")

        if not self._verify_signature(msg_signature, timestamp, nonce, echostr):
            return web.Response(text="signature mismatch", status=403)

        plaintext = self._decrypt(echostr)
        return web.Response(text=plaintext)

    # ------------------------------------------------------------------
    # Callback: receive message (POST)
    # ------------------------------------------------------------------

    async def _on_message(self, request: web.Request) -> web.Response:
        """接收企业微信推送的消息。"""
        msg_signature = request.query.get("msg_signature", "")
        timestamp = request.query.get("timestamp", "")
        nonce = request.query.get("nonce", "")

        body = await request.text()
        root = ET.fromstring(body)
        encrypt_node = root.find("Encrypt")
        if encrypt_node is None or encrypt_node.text is None:
            return web.Response(text="bad request", status=400)

        encrypt_text = encrypt_node.text
        if not self._verify_signature(msg_signature, timestamp, nonce, encrypt_text):
            return web.Response(text="signature mismatch", status=403)

        xml_text = self._decrypt(encrypt_text)
        msg = ET.fromstring(xml_text)

        msg_type = (msg.findtext("MsgType") or "").strip()
        from_user = (msg.findtext("FromUserName") or "").strip()
        content = (msg.findtext("Content") or "").strip()

        if msg_type != "text" or not content or not from_user:
            return web.Response(text="ok")

        # Process in background so we respond to WeCom quickly
        asyncio.create_task(self._handle_and_reply(from_user, content))
        return web.Response(text="ok")

    async def _handle_and_reply(self, user_id: str, content: str) -> None:
        """调用 handler 获取回复，通过 API 发送回企业微信。"""
        if self._handler is None:
            return
        session_key = f"wecom:{user_id}"
        try:
            reply = await self._handler(session_key, content)
        except Exception as exc:
            reply = f"[Error] {exc}"

        if reply is None:
            print(f"[WeCom] Message merged into batch, skipping reply")
            return

        await self._send_text(user_id, reply)

    # ------------------------------------------------------------------
    # Send message via API
    # ------------------------------------------------------------------

    async def _send_text(self, user_id: str, text: str) -> None:
        """调用企业微信 API 发送文本消息。"""
        token = await self._get_access_token()
        url = f"https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={token}"
        payload = {
            "touser": user_id,
            "agentid": self._cfg.agent_id,
            "msgtype": "text",
            "text": {"content": text},
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                data = await resp.json()
                if data.get("errcode", 0) != 0:
                    print(f"[WeCom] send failed: {data}")

    # ------------------------------------------------------------------
    # Access token management
    # ------------------------------------------------------------------

    async def _get_access_token(self) -> str:
        """获取 access_token（带缓存，过期自动刷新）。"""
        if self._token and time.time() < self._token_expires_at:
            return self._token

        url = "https://qyapi.weixin.qq.com/cgi-bin/gettoken"
        params = {"corpid": self._cfg.corp_id, "corpsecret": self._cfg.corp_secret}
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as resp:
                data = await resp.json()

        if data.get("errcode", 0) != 0:
            raise RuntimeError(f"Failed to get access_token: {data}")

        self._token = data["access_token"]
        # Refresh 5 minutes early to avoid edge-case expiry
        self._token_expires_at = time.time() + data.get("expires_in", 7200) - 300
        return self._token

    # ------------------------------------------------------------------
    # WeCom message encryption / signature
    # ------------------------------------------------------------------

    def _verify_signature(self, signature: str, timestamp: str, nonce: str, encrypt: str) -> bool:
        """SHA1 签名验证。"""
        parts = sorted([self._cfg.token, timestamp, nonce, encrypt])
        digest = hashlib.sha1("".join(parts).encode()).hexdigest()
        return digest == signature

    def _decrypt(self, encrypt_text: str) -> str:
        """AES-CBC 解密企业微信消息。"""
        cipher = Cipher(algorithms.AES(self._aes_key), modes.CBC(self._aes_key[:16]))
        decryptor = cipher.decryptor()
        raw = decryptor.update(base64.b64decode(encrypt_text)) + decryptor.finalize()

        # Remove PKCS#7 padding
        pad_len = raw[-1]
        raw = raw[:-pad_len]

        # Format: 16 bytes random + 4 bytes msg_len (network order) + msg + corp_id
        msg_len = struct.unpack("!I", raw[16:20])[0]
        msg = raw[20 : 20 + msg_len]
        return msg.decode("utf-8")
