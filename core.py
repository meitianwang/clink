"""Claude Code SDK wrapper for multi-turn conversations."""

from __future__ import annotations

from contextlib import AsyncExitStack

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, TextBlock
from config import load_config


class ClaudeChat:
    """Wraps ClaudeSDKClient for simple multi-turn chat."""

    def __init__(self) -> None:
        self._client: ClaudeSDKClient | None = None
        self._exit_stack: AsyncExitStack | None = None

        cfg = load_config()
        persona = cfg.get("persona")

        self._options = ClaudeAgentOptions(
            system_prompt=persona if persona else "",
            permission_mode="bypassPermissions",
        )

    async def _ensure_client(self) -> ClaudeSDKClient:
        if self._client is None:
            self._exit_stack = AsyncExitStack()
            client = ClaudeSDKClient(options=self._options)
            self._client = await self._exit_stack.enter_async_context(client)
        return self._client

    async def chat(self, prompt: str) -> str:
        """Send a message, return the full text reply."""
        client = await self._ensure_client()
        try:
            await client.query(prompt)
            parts: list[str] = []
            async for msg in client.receive_response():
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            parts.append(block.text)
            return "\n".join(parts) if parts else "(no response)"
        except Exception:
            await self.reset()
            raise

    async def reset(self) -> None:
        """Close current session and start fresh on next chat()."""
        if self._exit_stack is not None:
            await self._exit_stack.aclose()
            self._exit_stack = None
        self._client = None

    async def close(self) -> None:
        await self.reset()
