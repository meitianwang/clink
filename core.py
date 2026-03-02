"""Claude Code SDK wrapper for multi-turn conversations."""

from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, TextBlock
from config import load_config


class ClaudeChat:
    """Wraps ClaudeSDKClient for simple multi-turn chat.

    Uses a collect queue: if the agent is busy processing a message,
    incoming messages are queued and merged into a single follow-up turn
    once the current turn finishes.
    """

    def __init__(self, options: ClaudeAgentOptions) -> None:
        self._client: ClaudeSDKClient | None = None
        self._exit_stack: AsyncExitStack | None = None
        self._busy = False
        self._pending: list[tuple[str, asyncio.Future[str | None]]] = []
        self._options = options

    async def _ensure_client(self) -> ClaudeSDKClient:
        if self._client is None:
            self._exit_stack = AsyncExitStack()
            client = ClaudeSDKClient(options=self._options)
            self._client = await self._exit_stack.enter_async_context(client)
        return self._client

    async def _do_chat(self, prompt: str) -> str:
        """Send a message to Claude and collect the full text reply."""
        client = await self._ensure_client()
        await client.query(prompt)
        parts: list[str] = []
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        parts.append(block.text)
        return "\n".join(parts) if parts else "(no response)"

    async def chat(self, prompt: str) -> str | None:
        """Send a message, return the full text reply.

        If the agent is busy, the message is queued (collect mode).
        Returns None for callers whose messages were merged into a batch
        — they should skip sending a reply.
        """
        if self._busy:
            future: asyncio.Future[str | None] = asyncio.get_running_loop().create_future()
            self._pending.append((prompt, future))
            print(f"[Collect] Queued (pending: {len(self._pending)}): {prompt[:80]}")
            return await future

        self._busy = True
        try:
            reply = await self._do_chat(prompt)

            # Drain queued messages (collect mode)
            while self._pending:
                batch = list(self._pending)
                self._pending.clear()

                prompts = [p for p, _ in batch]
                merged = (
                    "[以下是你处理上一条消息期间用户追加发送的消息]\n"
                    + "\n".join(prompts)
                )
                print(f"[Collect] Merging {len(batch)} queued message(s): {merged[:120]}")

                # Earlier callers: their messages are merged, no separate reply
                for _, future in batch[:-1]:
                    future.set_result(None)

                # Process the merged message
                reply = await self._do_chat(merged)

                # Last caller gets the actual reply
                batch[-1][1].set_result(reply)

            return reply
        except Exception:
            # Resolve all pending futures so callers don't hang forever
            for _, future in self._pending:
                if not future.done():
                    future.set_result(None)
            self._pending.clear()
            await self.reset()
            raise
        finally:
            self._busy = False

    async def reset(self) -> None:
        """Close current session and start fresh on next chat()."""
        if self._exit_stack is not None:
            await self._exit_stack.aclose()
            self._exit_stack = None
        self._client = None

    async def close(self) -> None:
        await self.reset()


class ChatSessionManager:
    """Manages per-session ClaudeChat instances.

    Session key examples:
      - C2C:   user_openid  (per-user session)
      - Group: group_openid (per-group shared session)
      - WeCom: user_id
      - Terminal: "terminal" (single session)
    """

    def __init__(self) -> None:
        self._sessions: dict[str, ClaudeChat] = {}

        cfg = load_config()
        persona = cfg.get("persona")

        self._options = ClaudeAgentOptions(
            system_prompt=persona if persona else "",
            permission_mode="bypassPermissions",
        )

    def _get_session(self, session_key: str) -> ClaudeChat:
        """Get or create a ClaudeChat instance for the given session key."""
        if session_key not in self._sessions:
            self._sessions[session_key] = ClaudeChat(self._options)
            print(f"[Session] New session: {session_key}")
        return self._sessions[session_key]

    async def chat(self, session_key: str, prompt: str) -> str | None:
        """Route a message to the correct session."""
        session = self._get_session(session_key)
        return await session.chat(prompt)

    async def reset(self, session_key: str) -> None:
        """Reset a specific session."""
        if session_key in self._sessions:
            await self._sessions[session_key].reset()
            del self._sessions[session_key]
            print(f"[Session] Reset: {session_key}")

    async def close(self) -> None:
        """Close all sessions."""
        for session in self._sessions.values():
            await session.close()
        self._sessions.clear()
