"""Consent lookups against the RevokeConsentRegistry contract.

The gatekeeper is read-only by design: it never holds a user's key and never
writes consent state. Users init/revoke from their own wallet.
"""

import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import Enum
from importlib import resources
from typing import Protocol

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

ZERO_ADDRESS = "0x" + "00" * 20


class GatekeeperError(RuntimeError):
    """Consent state could not be determined. Callers must fail closed."""


class DenialReason(str, Enum):
    REVOKED = "revoked"                  # scope revoked by the owner (permanent)
    SESSION_ENDED = "session_ended"      # owner ended the session (permanent)
    NOT_REGISTERED = "not_registered"    # session or scope not on-chain (yet)
    OWNER_MISMATCH = "owner_mismatch"    # session registered by another address

    @property
    def is_permanent(self) -> bool:
        return self in (DenialReason.REVOKED, DenialReason.SESSION_ENDED)


@dataclass(frozen=True)
class AccessSnapshot:
    """Access decisions for a set of scopes, all read at one block."""

    session_id: bytes
    decisions: dict[bytes, bool]
    block_number: int
    chain_id: int
    registry_address: str
    denial_reasons: dict[bytes, DenialReason] = field(default_factory=dict)

    def is_allowed(self, scope_hash: bytes) -> bool:
        return self.decisions.get(scope_hash, False)

    def reason(self, scope_hash: bytes) -> DenialReason | None:
        if self.is_allowed(scope_hash):
            return None
        return self.denial_reasons.get(scope_hash, DenialReason.NOT_REGISTERED)


class AccessOracle(Protocol):
    def check_scopes(
        self, session_id: bytes, scope_hashes: Sequence[bytes], *, expected_owner: str | None = None
    ) -> AccessSnapshot: ...


def load_registry_abi() -> list[dict]:
    text = resources.files("revokeai_core").joinpath("abi/RevokeConsentRegistry.json").read_text("utf-8")
    return json.loads(text)


class ContractGatekeeper:
    """AccessOracle backed by the on-chain registry."""

    def __init__(self, w3: Web3, registry_address: str, expected_owner: str | None = None) -> None:
        """`expected_owner`, when set, makes every scope in a session owned by any
        other address count as denied — guards against a front-run squatter
        registering the user's sessionId with copied scope hashes."""
        self._w3 = w3
        self._address = Web3.to_checksum_address(registry_address)
        self._contract = w3.eth.contract(address=self._address, abi=load_registry_abi())
        self._expected_owner = Web3.to_checksum_address(expected_owner) if expected_owner else None
        self._chain_id: int | None = None

    @classmethod
    def from_rpc(
        cls, rpc_url: str, registry_address: str, expected_owner: str | None = None, timeout: float = 10.0
    ) -> "ContractGatekeeper":
        w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
        # Proof-of-authority chains such as MST carry >32-byte block extraData;
        # this middleware is a no-op on other chains.
        w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        return cls(w3, registry_address, expected_owner)

    @property
    def registry_address(self) -> str:
        return self._address

    @property
    def chain_id(self) -> int:
        if self._chain_id is None:
            try:
                self._chain_id = self._w3.eth.chain_id
            except Exception as exc:
                raise GatekeeperError(f"chain id lookup failed: {type(exc).__name__}") from exc
        return self._chain_id

    def check_scope_access(self, session_id: bytes, scope_hash: bytes) -> bool:
        return self.check_scopes(session_id, [scope_hash]).is_allowed(scope_hash)

    def check_scopes(
        self, session_id: bytes, scope_hashes: Sequence[bytes], *, expected_owner: str | None = None
    ) -> AccessSnapshot:
        """`expected_owner` overrides the instance default for this call, so one
        gatekeeper can serve sessions of many users."""
        hashes = list(dict.fromkeys(scope_hashes))
        owner_check = Web3.to_checksum_address(expected_owner) if expected_owner else self._expected_owner
        try:
            if self._chain_id is None:
                self._chain_id = self._w3.eth.chain_id
            # Pin every read to one block so the whole context is judged against
            # a single consistent consent state.
            block = self._w3.eth.block_number
            fns = self._contract.functions
            allowed = [bool(a) for a in fns.checkScopesAccess(session_id, hashes).call(block_identifier=block)] if hashes else []
            session_reason = None
            if owner_check is not None or not all(allowed):
                _, owner, _, is_active = fns.getSession(session_id).call(block_identifier=block)
                if owner == ZERO_ADDRESS:
                    session_reason = DenialReason.NOT_REGISTERED
                elif owner_check is not None and Web3.to_checksum_address(owner) != owner_check:
                    session_reason = DenialReason.OWNER_MISMATCH
                elif not is_active:
                    session_reason = DenialReason.SESSION_ENDED
            if session_reason is not None:
                allowed = [False] * len(hashes)
            reasons: dict[bytes, DenialReason] = {}
            for h, ok in zip(hashes, allowed):
                if ok:
                    continue
                if session_reason in (DenialReason.NOT_REGISTERED, DenialReason.OWNER_MISMATCH):
                    reasons[h] = session_reason
                    continue
                # An explicit scope revocation outranks a later endSession.
                is_revoked = fns.getScope(session_id, h).call(block_identifier=block)[2]
                if is_revoked:
                    reasons[h] = DenialReason.REVOKED
                else:
                    reasons[h] = session_reason or DenialReason.NOT_REGISTERED
        except Exception as exc:
            raise GatekeeperError(f"registry lookup failed: {type(exc).__name__}") from exc

        return AccessSnapshot(
            session_id=session_id,
            decisions=dict(zip(hashes, allowed)),
            block_number=block,
            chain_id=self._chain_id,
            registry_address=self._address,
            denial_reasons=reasons,
        )


class InMemoryAccessOracle:
    """Local stand-in for the registry, for unit tests and offline development."""

    def __init__(self, chain_id: int = 31337, registry_address: str = "0x" + "11" * 20) -> None:
        self._scopes: dict[bytes, dict[bytes, bool]] = {}
        self._active: dict[bytes, bool] = {}
        self._owners: dict[bytes, str | None] = {}
        self._block = 1
        self.chain_id = chain_id
        self.registry_address = Web3.to_checksum_address(registry_address)

    def init_session(self, session_id: bytes, scope_hashes: Sequence[bytes], owner: str | None = None) -> None:
        self._owners[session_id] = Web3.to_checksum_address(owner) if owner else None
        self._active[session_id] = True
        self._scopes[session_id] = {h: False for h in scope_hashes}
        self._block += 1

    def revoke(self, session_id: bytes, *scope_hashes: bytes) -> None:
        for h in scope_hashes:
            self._scopes[session_id][h] = True
        self._block += 1

    def end_session(self, session_id: bytes) -> None:
        self._active[session_id] = False
        self._block += 1

    def check_scopes(
        self, session_id: bytes, scope_hashes: Sequence[bytes], *, expected_owner: str | None = None
    ) -> AccessSnapshot:
        decisions: dict[bytes, bool] = {}
        reasons: dict[bytes, DenialReason] = {}
        scopes = self._scopes.get(session_id)
        owner = self._owners.get(session_id)
        for h in scope_hashes:
            if scopes is None or h not in scopes:
                reason = DenialReason.NOT_REGISTERED
            elif expected_owner and (owner is None or owner != Web3.to_checksum_address(expected_owner)):
                reason = DenialReason.OWNER_MISMATCH
            elif scopes[h]:
                reason = DenialReason.REVOKED
            elif not self._active[session_id]:
                reason = DenialReason.SESSION_ENDED
            else:
                reason = None
            decisions[h] = reason is None
            if reason is not None:
                reasons[h] = reason
        return AccessSnapshot(session_id, decisions, self._block, self.chain_id, self.registry_address, reasons)
