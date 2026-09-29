import logging
from collections.abc import Sequence
from contextlib import asynccontextmanager

from fastapi import Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.genai import errors as genai_errors

from .config import settings
from .extensions import ChatBlocked, ChatContext, ChatExtension, ExtensibleApp
from .extensions.revokeai import SESSION_TOKEN_HEADER, RevokeAIExtension
from .gemini_client import GeminiChat, GeminiNotConfiguredError
from .schemas import ChatRequest, ChatResponse, ChatTurn, HealthResponse

logger = logging.getLogger("revokeai")


def default_extensions() -> list[ChatExtension]:
    return [RevokeAIExtension.from_settings(settings)] if settings.revokeai_enabled else []


def create_app(extensions: Sequence[ChatExtension] | None = None) -> ExtensibleApp:
    @asynccontextmanager
    async def lifespan(app: ExtensibleApp):
        app.state.gemini = GeminiChat(settings.gemini_api_key, settings.gemini_model)
        if not settings.gemini_configured:
            logger.warning("GEMINI_API_KEY is not set; /api/chat will return 503.")
        yield
        await app.state.gemini.aclose()
        for ext in app.extensions:
            await ext.aclose()

    app = ExtensibleApp(title="RevokeAI Backend", version="0.3.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        # Production: ALLOWED_ORIGINS="https://<app>.vercel.app" (comma-separated), plus an
        # optional ALLOWED_ORIGIN_REGEX for preview deploys. No wildcard, no credentials.
        allow_origins=settings.allowed_origins,
        allow_origin_regex=settings.allowed_origin_regex,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", SESSION_TOKEN_HEADER],
    )

    @app.exception_handler(ChatBlocked)
    async def chat_blocked(_: Request, exc: ChatBlocked) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.body)

    @app.get("/api/health")
    async def health() -> HealthResponse:
        configured = settings.gemini_configured
        return HealthResponse(
            status="ok" if configured else "degraded",
            gemini_configured=configured,
            model=settings.gemini_model,
            # info() may read chain state (relayer balance), so keep it off the event loop.
            extensions={ext.name: await run_in_threadpool(ext.info) for ext in app.extensions},
        )

    @app.get("/api/debug-gemini")
    async def debug_gemini(request: Request) -> dict:
        """Temporary diagnostic endpoint — tests Gemini API from this server."""
        import traceback
        from google import genai
        from google.genai import types as gtypes

        key = settings.gemini_api_key
        model = settings.gemini_model
        result: dict = {
            "key_present": key is not None,
            "key_length": len(key) if key else 0,
            "key_prefix": key[:8] + "..." if key and len(key) > 8 else "(short)",
            "model": model,
            "tests": {},
        }

        if not key:
            result["tests"]["plain"] = {"status": "SKIPPED", "reason": "No API key"}
            return result

        client = genai.Client(api_key=key)

        # Test 1: Plain text call
        try:
            resp = client.models.generate_content(
                model=model,
                contents="Say hello in one word.",
            )
            result["tests"]["plain"] = {"status": "OK", "response": resp.text[:100]}
        except Exception as e:
            result["tests"]["plain"] = {
                "status": "FAILED",
                "error_type": type(e).__name__,
                "error": str(e)[:500],
                "traceback": traceback.format_exc()[-800:],
            }

        # Test 2: Structured JSON call
        try:
            from pydantic import BaseModel as BM
            class _T(BM):
                reply: str
            resp = client.models.generate_content(
                model=model,
                contents="Say hello in one word.",
                config=gtypes.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=_T,
                ),
            )
            result["tests"]["structured"] = {"status": "OK", "response": resp.text[:100]}
        except Exception as e:
            result["tests"]["structured"] = {
                "status": "FAILED",
                "error_type": type(e).__name__,
                "error": str(e)[:500],
            }

        return result

    @app.post("/api/chat")
    async def chat(
        body: ChatRequest,
        request: Request,
        session_token: str | None = Header(None, alias=SESSION_TOKEN_HEADER),
    ) -> ChatResponse:
        ctx = ChatContext(
            message=body.message,
            history=list(body.history),
            session_id=body.session_id,
            session_token=session_token,
        )
        # Extensions run before anything reaches the LLM and may raise ChatBlocked.
        for ext in app.extensions:
            await ext.before_chat(ctx)
        if ctx.session_id and not ctx.session_claimed:
            raise HTTPException(400, "sessionId was provided but no installed extension handles sessions.")

        gemini: GeminiChat = request.app.state.gemini
        try:
            answer = await gemini.reply(ctx.history, ctx.message, context=ctx.context)
        except GeminiNotConfiguredError:
            raise HTTPException(503, "Gemini API key is not configured on the server.")
        except genai_errors.ClientError as exc:
            # Log full details for diagnostics; the SDK never includes the key.
            logger.warning("Gemini client error %s: %s (full: %r)", exc.code, exc.message, exc)
            if exc.code == 429:
                raise HTTPException(429, "Upstream rate limit reached. Try again shortly.")
            raise HTTPException(502, f"The AI provider rejected the request: {exc.message}")
        except genai_errors.APIError as exc:
            logger.error("Gemini server error %s: %s (full: %r)", exc.code, exc.message, exc)
            raise HTTPException(502, f"The AI provider is unavailable: {exc.message}")

        reply = answer.reply
        for ext in app.extensions:
            await ext.after_chat(ctx, reply)

        history = [*ctx.history, ChatTurn(role="user", content=ctx.message)]
        if reply:
            history.append(ChatTurn(role="model", content=reply))
        return ChatResponse(
            reply=reply,
            reasoning=answer.reasoning,
            model=gemini.model,
            history=history,
            extensions=ctx.metadata or None,
        )

    for ext in default_extensions() if extensions is None else extensions:
        app.use_extension(ext)
    return app


app = create_app()
