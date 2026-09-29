"""Pluggable chat extensions.

An extension can mount its own routes and hook the chat pipeline:

    app = ExtensibleApp()
    app.use_extension(RevokeAIExtension.from_settings(settings))

`before_chat` may rewrite the context/history or raise `ChatBlocked` to stop
the request before it ever reaches the LLM. `after_chat` sees the reply.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol

from fastapi import FastAPI

from ..schemas import ChatTurn


class ChatBlocked(Exception):
    """Raised by an extension to answer the request without calling the LLM."""

    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        super().__init__(body.get("message", "blocked"))
        self.status_code = status_code
        self.body = body


@dataclass
class ChatContext:
    message: str
    history: list[ChatTurn]
    session_id: str | None = None
    session_token: str | None = None
    # Extra grounding text to send to the LLM with this turn only.
    context: str | None = None
    # Set by the extension that owns `session_id`; unclaimed sessions are rejected.
    session_claimed: bool = False
    # Per-extension data echoed back in the chat response, keyed by extension name.
    metadata: dict[str, Any] = field(default_factory=dict)
    # Extension-private scratch space carried from before_chat to after_chat.
    state: dict[str, Any] = field(default_factory=dict)


class ChatExtension(Protocol):
    name: str

    def install(self, app: "ExtensibleApp") -> None: ...

    async def before_chat(self, ctx: ChatContext) -> None: ...

    async def after_chat(self, ctx: ChatContext, reply: str) -> None: ...

    def info(self) -> dict[str, Any]: ...

    async def aclose(self) -> None: ...


class ExtensibleApp(FastAPI):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.extensions: list[ChatExtension] = []

    def use_extension(self, extension: ChatExtension) -> "ExtensibleApp":
        extension.install(self)
        self.extensions.append(extension)
        return self
