"""Strip revoked scopes from an LLM prompt context before it is sent."""

from collections.abc import Sequence
from dataclasses import dataclass

from .gatekeeper import AccessOracle, AccessSnapshot
from .receipts import ReceiptSigner, RevocationReceipt
from .scopes import DataScope


@dataclass(frozen=True)
class FilterResult:
    allowed: tuple[DataScope, ...]
    stripped: tuple[DataScope, ...]
    snapshot: AccessSnapshot
    receipt: RevocationReceipt | None = None

    @property
    def halted(self) -> bool:
        """True when no consented context remains; the agent must not run."""
        return self.receipt is not None

    def render_context(self) -> str:
        """Prompt-ready text containing only consented scopes."""
        if self.halted:
            raise RuntimeError("context fully revoked; refusing to render")
        return "\n\n".join(f"[{s.label}]\n{s.content}" for s in self.allowed)


class MemoryFilter:
    def __init__(self, oracle: AccessOracle, signer: ReceiptSigner) -> None:
        self._oracle = oracle
        self._signer = signer

    def filter(
        self, session_id: bytes, scopes: Sequence[DataScope], *, expected_owner: str | None = None
    ) -> FilterResult:
        """Check every scope against the registry at one block and drop denied ones.

        `expected_owner` treats a session registered by any other address as
        fully denied. Fails closed: if the oracle raises (RPC down, bad contract), the
        exception propagates and no context is released. If `scopes` is
        non-empty and every one is denied, the result is halted and carries a
        signed RevocationReceipt instead of context.
        """
        hashes = [s.scope_hash for s in scopes]
        snapshot = (
            self._oracle.check_scopes(session_id, hashes, expected_owner=expected_owner)
            if expected_owner
            else self._oracle.check_scopes(session_id, hashes)
        )

        allowed = tuple(s for s in scopes if snapshot.is_allowed(s.scope_hash))
        stripped = tuple(s for s in scopes if not snapshot.is_allowed(s.scope_hash))

        receipt = None
        if scopes and not allowed:
            receipt = self._signer.sign(
                session_id=session_id,
                revoked_scope_hashes=[s.scope_hash for s in stripped],
                block_number=snapshot.block_number,
                chain_id=snapshot.chain_id,
                registry_address=snapshot.registry_address,
            )
        return FilterResult(allowed=allowed, stripped=stripped, snapshot=snapshot, receipt=receipt)
