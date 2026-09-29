"""RevokeAI extension: consent-gated document context for the chat pipeline.

Flow (gasless; the blockchain is invisible to end users)
--------------------------------------------------------
1. POST /api/documents/upload      parse file → scopes kept in server memory;
                                   returns sessionId + secret session token.
2. POST /api/relayer/initSession   the server's relayer wallet registers the
                                   scopes on MST and pays the gas.
3. POST /api/chat {sessionId}      before Gemini: consent for every scope is
                                   read at one block; the request is blocked
                                   (403) if the question targets a denied scope,
                                   otherwise only consented scopes are sent.
4. POST /api/relayer/revokeScope   the relayer revokes on MST; content is purged
                                   from memory as soon as the tx confirms.

The relayer is the on-chain owner of every session (custodial consent), so every
relayed action is authorised by the session token issued at upload. The on-chain
`sessionId` is public and is never an access credential by itself.
"""

import asyncio
import dataclasses
import hashlib
import hmac
import logging
import os
import secrets
import time
from collections import OrderedDict, defaultdict, deque
from dataclasses import dataclass, field
from pathlib import PurePath
from typing import Any

from eth_account import Account
from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field
from web3 import Web3

from revokeai_core import (
    SUPPORTED_DESCRIPTION,
    AccessOracle,
    ConsentRelayer,
    ContractGatekeeper,
    DataScope,
    DenialReason,
    DocumentAI,
    DocumentParser,
    GatekeeperError,
    GeminiDocumentAI,
    MemoryFilter,
    ReceiptSigner,
    RelayedTx,
    RelayerError,
    ScopeRouter,
    UnsupportedDocument,
    ingest_document,
)

from . import ChatBlocked, ChatContext, ExtensibleApp
from ..config import MST_TESTNET_CHAIN_ID
from ..schemas import BYTES32_PATTERN, ChatTurn

logger = logging.getLogger("revokeai.extension")

SESSION_TOKEN_HEADER = "X-RevokeAI-Session-Token"
MAX_UPLOAD_BYTES = 10_000_000  # PDFs/images; Gemini inline limit is ~20 MB
MAX_SCOPES = 256  # RevokeConsentRegistry.MAX_SCOPES_PER_SESSION
REDACTED_TURN = "[Removed by RevokeAI: this answer used data whose consent has been revoked on-chain.]"
# Relayer spend protection: requests per client IP per window.
RATE_WINDOW_SECONDS = 600
UPLOADS_PER_WINDOW = 20
RELAYED_TX_PER_WINDOW = 60
LOW_BALANCE_WEI = Web3.to_wei(0.01, "ether")

# Order decides which reason headlines a block that mixes several.
_REASON_PRIORITY = (
    DenialReason.SESSION_ENDED,
    DenialReason.REVOKED,
    DenialReason.OWNER_MISMATCH,
    DenialReason.NOT_REGISTERED,
)


# ----------------------------------------------------------------------------
# Ephemeral session store
# ----------------------------------------------------------------------------


@dataclass
class SessionRecord:
    session_id: bytes
    owner: str  # on-chain owner = relayer address
    token_digest: bytes
    filename: str
    scopes: list[DataScope]
    created_at: float = field(default_factory=time.time)
    # sha256(model reply) -> scope hashes that grounded it; drives history redaction.
    provenance: dict[bytes, frozenset[bytes]] = field(default_factory=dict)
    purged: set[bytes] = field(default_factory=set)
    registration: RelayedTx | None = None
    revocations: dict[bytes, RelayedTx] = field(default_factory=dict)
    ended: RelayedTx | None = None
    # Serialises relayed writes for this session (double-clicks, retries).
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @property
    def session_id_hex(self) -> str:
        return "0x" + self.session_id.hex()

    def purge(self, scope_hash: bytes) -> bool:
        """Drop a scope's content from server memory. Only for permanent denials."""
        if scope_hash in self.purged:
            return False
        self.scopes = [dataclasses.replace(s, content="") if s.scope_hash == scope_hash else s for s in self.scopes]
        self.purged.add(scope_hash)
        return True


class SessionStore:
    """In-process, TTL-bounded store. Chunks never touch disk."""

    def __init__(self, ttl_seconds: int, max_sessions: int = 500) -> None:
        self._ttl = ttl_seconds
        self._max = max_sessions
        self._items: OrderedDict[bytes, SessionRecord] = OrderedDict()

    def __len__(self) -> int:
        self._evict()
        return len(self._items)

    def put(self, record: SessionRecord) -> None:
        self._evict()
        while len(self._items) >= self._max:
            self._items.popitem(last=False)
        self._items[record.session_id] = record

    def get(self, session_id: bytes) -> SessionRecord | None:
        self._evict()
        return self._items.get(session_id)

    def expires_at(self, record: SessionRecord) -> float:
        return record.created_at + self._ttl

    def _evict(self) -> None:
        cutoff = time.time() - self._ttl
        while self._items and next(iter(self._items.values())).created_at < cutoff:
            self._items.popitem(last=False)


class RateLimiter:
    """Sliding-window limiter keyed by client; protects the relayer's gas budget."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self._limit = limit
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and hits[0] <= now - self._window:
            hits.popleft()
        if len(hits) >= self._limit:
            raise HTTPException(429, "Too many requests. Please wait a few minutes and try again.")
        hits.append(now)


def _digest(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def _reply_key(text: str) -> bytes:
    return hashlib.sha256(text.strip().encode()).digest()


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# ----------------------------------------------------------------------------
# Request bodies
# ----------------------------------------------------------------------------


class SessionBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    session_id: str = Field(alias="sessionId", pattern=BYTES32_PATTERN)


class RevokeBody(SessionBody):
    scope_hashes: list[str] = Field(alias="scopeHashes", min_length=1, max_length=MAX_SCOPES)


# ----------------------------------------------------------------------------
# Extension
# ----------------------------------------------------------------------------


class RevokeAIExtension:
    name = "revokeai"

    def __init__(
        self,
        gatekeeper: AccessOracle,
        signer: ReceiptSigner,
        relayer: ConsentRelayer | None,
        *,
        registry_address: str,
        rpc_url: str | None = None,
        explorer_url: str | None = None,
        network_label: str = "MST Blockchain",
        session_ttl_seconds: int = 7200,
        parser: DocumentParser | None = None,
        router: ScopeRouter | None = None,
        document_ai: DocumentAI | None = None,
    ) -> None:
        self._gatekeeper = gatekeeper
        self._signer = signer
        self._relayer = relayer
        self._filter = MemoryFilter(gatekeeper, signer)
        self._registry = Web3.to_checksum_address(registry_address)
        self._rpc_url = rpc_url
        self._explorer = explorer_url.rstrip("/") if explorer_url else None
        self._network_label = network_label
        self._parser = parser or DocumentParser()
        # Gemini vision + semantic chunking; None = rule-based parsing only.
        self._document_ai = document_ai
        self._router = router or ScopeRouter()
        self._store = SessionStore(session_ttl_seconds)
        self._upload_limit = RateLimiter(UPLOADS_PER_WINDOW, RATE_WINDOW_SECONDS)
        self._relay_limit = RateLimiter(RELAYED_TX_PER_WINDOW, RATE_WINDOW_SECONDS)
        self._balance_cache: tuple[float, int] | None = None

    @classmethod
    def from_settings(cls, settings) -> "RevokeAIExtension":
        key = settings.revokeai_signer_key
        if key:
            signer = ReceiptSigner(key)
        else:
            signer = ReceiptSigner(Account.create().key)
            logger.warning(
                "REVOKEAI_SIGNER_KEY not set; using an ephemeral receipt-signing key (%s). "
                "Receipts will not verify after restart.",
                signer.address,
            )
        relayer = None
        if settings.revokeai_relayer_key:
            relayer = ConsentRelayer.from_rpc(
                settings.revokeai_rpc_url, settings.revokeai_registry_address, settings.revokeai_relayer_key
            )
            logger.info("RevokeAI relayer wallet: %s", relayer.address)
        else:
            logger.warning("No relayer key (REVOKEAI_RELAYER_PRIVATE_KEY / MST_USER_PRIVATE_KEY); secure mode disabled.")
        document_ai = None
        if settings.revokeai_semantic_chunking and settings.gemini_api_key:
            document_ai = GeminiDocumentAI(settings.gemini_api_key, settings.revokeai_doc_model)
        return cls(
            ContractGatekeeper.from_rpc(settings.revokeai_rpc_url, settings.revokeai_registry_address),
            signer,
            relayer,
            registry_address=settings.revokeai_registry_address,
            rpc_url=settings.revokeai_rpc_url,
            explorer_url=settings.revokeai_explorer_url,
            session_ttl_seconds=settings.revokeai_session_ttl_seconds,
            document_ai=document_ai,
        )

    # -- lifecycle -----------------------------------------------------------

    def install(self, app: ExtensibleApp) -> None:
        app.include_router(self._documents_api())
        app.include_router(self._relayer_api())

    def info(self) -> dict[str, Any]:
        """Public configuration for clients. Contains no secrets."""
        relayer: dict[str, Any] = {"configured": self._relayer is not None}
        if self._relayer is not None:
            relayer["address"] = self._relayer.address
            balance = self._relayer_balance()
            if balance is not None:
                relayer["balance"] = str(Web3.from_wei(balance, "ether"))
                relayer["lowBalance"] = balance < LOW_BALANCE_WEI
        chain_id = None
        try:
            chain_id = self._gatekeeper.chain_id
        except Exception:
            pass
        return {
            "network": self._network_label,
            "chainId": chain_id,
            "registry": self._registry,
            "rpcUrl": self._rpc_url,
            "explorerUrl": self._explorer,
            "receiptSigner": self._signer.address,
            "relayer": relayer,
            "documentAI": {
                "enabled": self._document_ai is not None,
                "model": getattr(self._document_ai, "model", None),
                "formats": SUPPORTED_DESCRIPTION,
            },
            "activeSessions": len(self._store),
        }

    async def aclose(self) -> None:
        close = getattr(self._document_ai, "aclose", None)
        if close is not None:
            await close()

    def _relayer_balance(self) -> int | None:
        now = time.monotonic()
        if self._balance_cache and now - self._balance_cache[0] < 30:
            return self._balance_cache[1]
        try:
            balance = self._relayer.balance_wei()
        except Exception:
            return None
        self._balance_cache = (now, balance)
        return balance

    # -- routes: documents ---------------------------------------------------

    def _documents_api(self) -> APIRouter:
        api = APIRouter(prefix="/api/documents", tags=["revokeai"])

        @api.post("/upload")
        async def upload(request: Request, file: UploadFile = File(...)):
            self._require_relayer()
            self._upload_limit.check(_client(request))
            data = await file.read(MAX_UPLOAD_BYTES + 1)
            if len(data) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, f"File exceeds {MAX_UPLOAD_BYTES // 1_000_000} MB.")
            try:
                result = await ingest_document(
                    file.filename or "document", data, ai=self._document_ai, parser=self._parser
                )
            except UnsupportedDocument as exc:
                raise HTTPException(415, str(exc)) from exc
            parsed = result.parsed
            if not parsed.scopes:
                raise HTTPException(422, "No content found in document.")
            if len(parsed.scopes) > MAX_SCOPES:
                raise HTTPException(422, f"Document produced more than {MAX_SCOPES} scopes.")

            token = secrets.token_urlsafe(32)
            record = SessionRecord(
                session_id=os.urandom(32),
                owner=self._relayer.address,
                token_digest=_digest(token),
                filename=PurePath(file.filename or "document").name,
                scopes=list(parsed.scopes),
            )
            # The salt is not retained: hashes are fixed now and only the
            # relayer registers them, after the user confirms.
            self._store.put(record)
            return {
                "sessionId": record.session_id_hex,
                "sessionToken": token,
                "sessionTokenHeader": SESSION_TOKEN_HEADER,
                "expiresAt": int(self._store.expires_at(record)),
                "filename": record.filename,
                "scopes": [
                    {
                        "label": s.label,
                        "scopeHash": s.scope_hash_hex,
                        "chars": len(s.content),
                        # Shown only to the uploader (who already holds the file) for review.
                        "preview": _preview(s.content),
                    }
                    for s in parsed.scopes
                ],
                "ingestion": {
                    "sourceType": result.source_kind,
                    "extraction": result.extraction,  # native | ocr
                    "chunking": result.chunking,  # semantic | rules
                    "textChars": result.text_chars,
                    "pages": result.pages,
                    "model": getattr(self._document_ai, "model", None) if result.chunking == "semantic" or result.extraction == "ocr" else None,
                    "warnings": list(result.warnings),
                },
            }

        @api.get("/{session_id}")
        async def status(session_id: str, token: str | None = Header(None, alias=SESSION_TOKEN_HEADER)):
            record = self._authorize(session_id, token)
            snapshot = await self._snapshot(record)
            self._purge_permanent(record, snapshot)
            return {
                "sessionId": record.session_id_hex,
                "filename": record.filename,
                "registry": self._registry,
                "blockNumber": snapshot.block_number,
                "registration": self._tx_json(record.registration),
                "ended": self._tx_json(record.ended),
                "scopes": [
                    {
                        "label": s.label,
                        "scopeHash": s.scope_hash_hex,
                        "allowed": snapshot.is_allowed(s.scope_hash),
                        "reason": (r.value if (r := snapshot.reason(s.scope_hash)) else None),
                        "purgedFromMemory": s.scope_hash in record.purged,
                        "revocation": self._tx_json(record.revocations.get(s.scope_hash)),
                    }
                    for s in record.scopes
                ],
            }

        return api

    # -- routes: relayer (gasless writes) -----------------------------------

    def _relayer_api(self) -> APIRouter:
        api = APIRouter(prefix="/api/relayer", tags=["revokeai"])

        @api.post("/initSession")
        async def init_session(
            body: SessionBody, request: Request, token: str | None = Header(None, alias=SESSION_TOKEN_HEADER)
        ):
            relayer = self._require_relayer()
            record = self._authorize(body.session_id, token)
            async with record.lock:
                if record.registration is None:
                    self._relay_limit.check(_client(request))
                    record.registration = await self._relay(
                        relayer.init_session,
                        record.session_id,
                        [s.scope_hash for s in record.scopes],
                        [s.label for s in record.scopes],
                    )
            return {**self._tx_json(record.registration), "scopeCount": len(record.scopes)}

        @api.post("/revokeScope")
        async def revoke_scope(
            body: RevokeBody, request: Request, token: str | None = Header(None, alias=SESSION_TOKEN_HEADER)
        ):
            relayer = self._require_relayer()
            record = self._authorize(body.session_id, token)
            hashes = self._parse_hashes(record, body.scope_hashes)
            async with record.lock:
                if record.registration is None:
                    raise HTTPException(409, "This document is not secured on-chain yet.")
                if record.ended is not None:
                    raise HTTPException(409, "This session has already been ended; every scope is revoked.")
                pending = [h for h in hashes if h not in record.revocations]
                if pending:
                    self._relay_limit.check(_client(request))
                    tx = await self._relay(relayer.revoke_scopes, record.session_id, pending)
                    for h in pending:
                        record.revocations[h] = tx
                        record.purge(h)  # memory hygiene: gone the moment the chain confirms
            unique = {record.revocations[h].tx_hash: record.revocations[h] for h in hashes}
            return {
                "revoked": [{"scopeHash": "0x" + h.hex(), **self._tx_json(record.revocations[h])} for h in hashes],
                "transactions": [self._tx_json(t) for t in unique.values()],
            }

        @api.post("/endSession")
        async def end_session(
            body: SessionBody, request: Request, token: str | None = Header(None, alias=SESSION_TOKEN_HEADER)
        ):
            relayer = self._require_relayer()
            record = self._authorize(body.session_id, token)
            async with record.lock:
                if record.registration is None:
                    raise HTTPException(409, "This document is not secured on-chain yet.")
                if record.ended is None:
                    self._relay_limit.check(_client(request))
                    record.ended = await self._relay(relayer.end_session, record.session_id)
                    for s in list(record.scopes):
                        record.purge(s.scope_hash)
            return self._tx_json(record.ended)

        return api

    # -- chat hooks ----------------------------------------------------------

    async def before_chat(self, ctx: ChatContext) -> None:
        if not ctx.session_id:
            return
        ctx.session_claimed = True
        try:
            record = self._authorize(ctx.session_id, ctx.session_token)
        except HTTPException as exc:
            raise ChatBlocked(exc.status_code, {"status": "error", "message": exc.detail}) from exc

        try:
            result = await run_in_threadpool(self._filter.filter, record.session_id, record.scopes, expected_owner=record.owner)
        except GatekeeperError:
            logger.exception("consent lookup failed for session %s", record.session_id_hex)
            raise ChatBlocked(503, {
                "status": "error",
                "message": f"Consent registry on {self._network_label} is unreachable; request blocked (fail-closed).",
            })
        snapshot = result.snapshot
        self._purge_permanent(record, snapshot)

        denied = {s.scope_hash for s in result.stripped}
        relevant = self._router.relevant(ctx.message, record.scopes)
        denied_relevant = [s for s in relevant if s.scope_hash in denied]
        if denied_relevant:
            receipt = self._signer.sign(
                session_id=record.session_id,
                revoked_scope_hashes=[s.scope_hash for s in denied_relevant],
                block_number=snapshot.block_number,
                chain_id=snapshot.chain_id,
                registry_address=snapshot.registry_address,
            )
            raise self._blocked(denied_relevant, snapshot, receipt)
        if result.halted:
            raise self._blocked(list(result.stripped), snapshot, result.receipt)

        allowed = {s.scope_hash for s in result.allowed}
        context_scopes = [s for s in relevant if s.scope_hash in allowed] or list(result.allowed)
        ctx.context = "\n\n".join(f"[{s.label}]\n{s.content}" for s in context_scopes)

        redacted = 0
        for i, turn in enumerate(ctx.history):
            if turn.role == "model" and record.provenance.get(_reply_key(turn.content), frozenset()) & denied:
                ctx.history[i] = ChatTurn(role="model", content=REDACTED_TURN)
                redacted += 1

        ctx.state[self.name] = {"record": record, "used": frozenset(s.scope_hash for s in context_scopes)}
        ctx.metadata[self.name] = {
            "sessionId": record.session_id_hex,
            "registry": snapshot.registry_address,
            "blockNumber": snapshot.block_number,
            "scopesUsed": [s.label for s in context_scopes],
            "scopesWithheld": [
                {"label": s.label, "reason": snapshot.reason(s.scope_hash).value} for s in result.stripped
            ],
            "historyTurnsRedacted": redacted,
        }

    async def after_chat(self, ctx: ChatContext, reply: str) -> None:
        state = ctx.state.get(self.name)
        if state and reply:
            state["record"].provenance[_reply_key(reply)] = state["used"]

    # -- helpers -------------------------------------------------------------

    def _require_relayer(self) -> ConsentRelayer:
        if self._relayer is None:
            raise HTTPException(503, "Secure mode is unavailable: the RevokeAI relayer is not configured on the server.")
        return self._relayer

    async def _relay(self, fn, *args) -> RelayedTx:
        try:
            tx = await run_in_threadpool(fn, *args)
        except RelayerError as exc:
            raise HTTPException(502, f"Could not record this on {self._network_label}: {exc}") from exc
        self._balance_cache = None
        return tx

    def _tx_json(self, tx: RelayedTx | None) -> dict[str, Any] | None:
        if tx is None:
            return None
        return {
            "txHash": tx.tx_hash,
            "blockNumber": tx.block_number,
            "function": tx.function,
            "explorerUrl": f"{self._explorer}/tx/{tx.tx_hash}" if self._explorer else None,
        }

    def _parse_hashes(self, record: SessionRecord, raw: list[str]) -> list[bytes]:
        try:
            hashes = list(dict.fromkeys(bytes.fromhex(h.removeprefix("0x")) for h in raw))
        except ValueError:
            raise HTTPException(422, "scopeHashes must be 0x-prefixed bytes32 hex strings.")
        known = {s.scope_hash for s in record.scopes}
        unknown = ["0x" + h.hex() for h in hashes if h not in known]
        if unknown:
            raise HTTPException(422, {"message": "Unknown scope hashes for this session.", "scopeHashes": unknown})
        return hashes

    def _purge_permanent(self, record: SessionRecord, snapshot) -> None:
        """Memory hygiene: permanently revoked data is deleted from server memory
        the first time the gatekeeper observes the revocation."""
        for scope in list(record.scopes):
            reason = snapshot.reason(scope.scope_hash)
            if reason and reason.is_permanent and record.purge(scope.scope_hash):
                logger.info("purged scope %s (%s) from memory: %s", scope.scope_hash_hex, scope.label, reason.value)

    def _authorize(self, session_id: str, token: str | None) -> SessionRecord:
        try:
            sid = bytes.fromhex(session_id.removeprefix("0x"))
        except ValueError:
            sid = b""
        if len(sid) != 32:
            raise HTTPException(422, "sessionId must be a 0x-prefixed bytes32 hex string.")
        record = self._store.get(sid)
        if record is None:
            raise HTTPException(404, "Unknown or expired session. Upload the document again.")
        if not token or not hmac.compare_digest(_digest(token), record.token_digest):
            raise HTTPException(401, f"Missing or invalid {SESSION_TOKEN_HEADER} header.")
        return record

    async def _snapshot(self, record: SessionRecord):
        try:
            return await run_in_threadpool(
                self._gatekeeper.check_scopes,
                record.session_id,
                [s.scope_hash for s in record.scopes],
                expected_owner=record.owner,
            )
        except GatekeeperError as exc:
            raise HTTPException(503, "Consent registry unreachable.") from exc

    def _blocked(self, scopes: list[DataScope], snapshot, receipt) -> ChatBlocked:
        by_reason: dict[DenialReason, list[str]] = {}
        for s in scopes:
            by_reason.setdefault(snapshot.reason(s.scope_hash), []).append(s.label)
        reason = next(r for r in _REASON_PRIORITY if r in by_reason)
        labels = ", ".join(by_reason[reason])
        net = self._network_label
        message = {
            DenialReason.REVOKED: f"Access Denied: Permission for {labels} was permanently revoked on {net}.",
            DenialReason.SESSION_ENDED: f"Access Denied: This session was permanently ended on {net}. All of its data scopes are revoked.",
            DenialReason.OWNER_MISMATCH: f"Access Denied: The on-chain record for {labels} was not created by this RevokeAI gateway.",
            DenialReason.NOT_REGISTERED: f"Consent Required: {labels} is not secured on {net} yet. Secure the document before asking about it.",
        }[reason]
        return ChatBlocked(403, {
            "status": "blocked",
            "message": message,
            "reason": reason.value,
            "reasoning": _block_reasoning(reason, by_reason[reason], snapshot),
            "deniedScopes": [
                {"label": s.label, "scopeHash": s.scope_hash_hex, "reason": snapshot.reason(s.scope_hash).value}
                for s in scopes
            ],
            "blockNumber": snapshot.block_number,
            "registry": snapshot.registry_address,
            "chainId": snapshot.chain_id,
            "receipt": receipt.to_dict() if receipt else None,
        })


def _block_reasoning(reason: DenialReason, labels: list[str], snapshot) -> str:
    """Audit-log explanation of a gatekeeper block. Deterministic: written by
    the middleware from the on-chain snapshot, never by the model."""
    ledger = "MST Testnet" if snapshot.chain_id == MST_TESTNET_CHAIN_ID else f"chain {snapshot.chain_id}"
    names = ", ".join(f"'{label}'" for label in labels)
    scope_s = "scope" if len(labels) == 1 else "scopes"
    this = "this scope was" if len(labels) == 1 else "these scopes were"
    check = f"Contract check on {ledger} (block {snapshot.block_number})"
    finding = {
        DenialReason.REVOKED: f"confirmed {this} permanently revoked",
        DenialReason.SESSION_ENDED: "confirmed the session was permanently ended, revoking every scope in it",
        DenialReason.OWNER_MISMATCH: f"found {this} registered by an address other than this gateway's relayer",
        DenialReason.NOT_REGISTERED: f"found no consent registered for {this.split()[0]} {scope_s}",
    }[reason]
    return (
        f"Query intercepted by Gatekeeper. User requested information requiring the {names} {scope_s}. "
        f"{check} {finding}. Execution halted before reaching the LLM."
    )


def _preview(content: str, limit: int = 180) -> str:
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    text = " · ".join(lines[1:] or lines)  # skip the section heading line
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
