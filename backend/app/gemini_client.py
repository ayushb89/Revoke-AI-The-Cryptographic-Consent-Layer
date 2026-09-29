"""Thin wrapper around the Google Gen AI SDK for multi-turn chat.

Replies are requested as structured JSON: `{"reply": ..., "reasoning": ...}`.
`reasoning` is the model's own short account of how it answered (which
document scopes it drew on); it is self-reported and shown alongside the
gateway's authoritative record of what was actually sent to the model.
"""

import json
import logging
import re
from dataclasses import dataclass

from google import genai
from google.genai import types
from pydantic import BaseModel

from .schemas import ChatTurn

logger = logging.getLogger("revokeai.gemini")

SYSTEM_INSTRUCTION = (
    "You are a helpful, precise AI assistant. Answer clearly and concisely."
)

GROUNDED_INSTRUCTION = (
    " When the user's message includes a <consented_document_context> block, answer questions "
    "about their document using only that block. If the answer is not in it, say you do not "
    "have access to that information; never guess or rely on earlier turns for document facts."
)

REASONING_INSTRUCTION = (
    "\n\nRespond with a JSON object with exactly two string fields:\n"
    '- "reply": your complete answer for the user. Markdown is allowed.\n'
    '- "reasoning": 1-3 short sentences for a technical audit log: what the user asked, which '
    "document scopes you used (name them exactly as the bracketed labels, e.g. [Lipid Panel], appear "
    "in <consented_document_context>; say \"no document scopes\" if none were provided or needed), and "
    "a brief summary of your logic. Do not repeat sensitive values from the document in the reasoning."
)

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


class _Structured(BaseModel):
    reply: str
    reasoning: str


@dataclass(frozen=True)
class GeminiReply:
    reply: str
    reasoning: str | None = None


class GeminiNotConfiguredError(RuntimeError):
    pass


def parse_structured(raw: str) -> GeminiReply:
    """Parse the model's JSON reply defensively: tolerate markdown fences and
    fall back to treating the whole output as the reply."""
    text = _FENCE.sub("", raw or "").strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict) and isinstance(data.get("reply"), str):
            reasoning = data.get("reasoning")
            return GeminiReply(data["reply"], reasoning.strip() if isinstance(reasoning, str) and reasoning.strip() else None)
    except (json.JSONDecodeError, TypeError):
        pass
    logger.warning("Gemini returned non-JSON output; using it as the reply without reasoning")
    return GeminiReply(raw or "", None)


class GeminiChat:
    def __init__(self, api_key: str | None, model: str) -> None:
        self._model = model
        self._client = genai.Client(api_key=api_key) if api_key else None

    @property
    def model(self) -> str:
        return self._model

    async def reply(self, history: list[ChatTurn], message: str, context: str | None = None) -> GeminiReply:
        if self._client is None:
            raise GeminiNotConfiguredError("GEMINI_API_KEY is not set")

        contents = [
            types.Content(role=turn.role, parts=[types.Part.from_text(text=turn.content)])
            for turn in history
        ]
        # Context rides on this turn only; it is never written back into history.
        text = f"<consented_document_context>\n{context}\n</consented_document_context>\n\n{message}" if context else message
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=text)]))

        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION + (GROUNDED_INSTRUCTION if context else "") + REASONING_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=_Structured,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, _Structured):
            return GeminiReply(parsed.reply, parsed.reasoning.strip() or None)
        return parse_structured(response.text or "")

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aio.aclose()
