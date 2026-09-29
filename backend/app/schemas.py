from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_MESSAGE_CHARS = 32_000
MAX_HISTORY_TURNS = 100
BYTES32_PATTERN = r"^0x[0-9a-fA-F]{64}$"


class ChatTurn(BaseModel):
    role: Literal["user", "model"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    history: list[ChatTurn] = Field(default_factory=list, max_length=MAX_HISTORY_TURNS)
    session_id: str | None = Field(default=None, alias="sessionId", pattern=BYTES32_PATTERN)


class ChatResponse(BaseModel):
    reply: str
    # The model's self-reported explanation of how it answered (may be absent).
    reasoning: str | None = None
    model: str
    history: list[ChatTurn]
    extensions: dict[str, Any] | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    gemini_configured: bool
    model: str
    extensions: dict[str, dict[str, Any]] = Field(default_factory=dict)
