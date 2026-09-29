"""EIP-712 signed revocation receipts.

When the MemoryFilter halts because every scope in the context is denied by
the registry, the gateway issues a receipt proving *which* scopes were denied,
*against which* registry, *at which* block. Anyone can verify the receipt
off-chain (or on-chain via ecrecover) against the gateway's public address.
"""

import os
import time
from collections.abc import Sequence
from dataclasses import dataclass

from eth_abi.packed import encode_packed
from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import keccak, to_checksum_address

DOMAIN_NAME = "RevokeAI Gateway"
DOMAIN_VERSION = "1"
SIGNER_KEY_ENV = "REVOKEAI_SIGNER_KEY"

RECEIPT_TYPES = {
    "RevocationReceipt": [
        {"name": "sessionId", "type": "bytes32"},
        {"name": "revokedScopesRoot", "type": "bytes32"},
        {"name": "blockNumber", "type": "uint256"},
        {"name": "issuedAt", "type": "uint256"},
    ]
}


def scopes_root(scope_hashes: Sequence[bytes]) -> bytes:
    """keccak256(abi.encodePacked(sorted hashes)) — order-independent commitment."""
    ordered = sorted(scope_hashes)
    return keccak(encode_packed(["bytes32"] * len(ordered), ordered))


@dataclass(frozen=True)
class RevocationReceipt:
    session_id: bytes
    revoked_scope_hashes: tuple[bytes, ...]
    block_number: int
    issued_at: int
    chain_id: int
    registry_address: str
    signer: str
    signature: bytes

    def typed_message(self) -> tuple[dict, dict]:
        domain = _domain(self.chain_id, self.registry_address)
        message = {
            "sessionId": self.session_id,
            "revokedScopesRoot": scopes_root(self.revoked_scope_hashes),
            "blockNumber": self.block_number,
            "issuedAt": self.issued_at,
        }
        return domain, message

    def to_dict(self) -> dict:
        return {
            "type": "RevokeAI.RevocationReceipt/v1",
            "sessionId": "0x" + self.session_id.hex(),
            "revokedScopeHashes": ["0x" + h.hex() for h in self.revoked_scope_hashes],
            "revokedScopesRoot": "0x" + scopes_root(self.revoked_scope_hashes).hex(),
            "blockNumber": self.block_number,
            "issuedAt": self.issued_at,
            "chainId": self.chain_id,
            "registry": self.registry_address,
            "signer": self.signer,
            "signature": "0x" + self.signature.hex(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "RevocationReceipt":
        """Inverse of `to_dict`, for verifying receipts received as JSON."""
        unhex = lambda v: bytes.fromhex(v.removeprefix("0x"))  # noqa: E731
        return cls(
            session_id=unhex(data["sessionId"]),
            revoked_scope_hashes=tuple(unhex(h) for h in data["revokedScopeHashes"]),
            block_number=int(data["blockNumber"]),
            issued_at=int(data["issuedAt"]),
            chain_id=int(data["chainId"]),
            registry_address=data["registry"],
            signer=data["signer"],
            signature=unhex(data["signature"]),
        )


class ReceiptSigner:
    """Holds the gateway's receipt-signing key. Load it from the environment;
    never hardcode it. This key is not the user's wallet and cannot touch
    consent state — it only attests to what the gateway observed."""

    def __init__(self, private_key: str | bytes) -> None:
        self._account = Account.from_key(private_key)

    @classmethod
    def from_env(cls, var: str = SIGNER_KEY_ENV) -> "ReceiptSigner":
        key = os.getenv(var)
        if not key:
            raise RuntimeError(f"{var} is not set")
        return cls(key)

    @property
    def address(self) -> str:
        return self._account.address

    def sign(
        self,
        *,
        session_id: bytes,
        revoked_scope_hashes: Sequence[bytes],
        block_number: int,
        chain_id: int,
        registry_address: str,
        issued_at: int | None = None,
    ) -> RevocationReceipt:
        unsigned = RevocationReceipt(
            session_id=session_id,
            revoked_scope_hashes=tuple(sorted(revoked_scope_hashes)),
            block_number=block_number,
            issued_at=issued_at if issued_at is not None else int(time.time()),
            chain_id=chain_id,
            registry_address=to_checksum_address(registry_address),
            signer=self.address,
            signature=b"",
        )
        domain, message = unsigned.typed_message()
        signed = self._account.sign_typed_data(domain, RECEIPT_TYPES, message)
        return RevocationReceipt(**{**unsigned.__dict__, "signature": bytes(signed.signature)})


def recover_receipt_signer(receipt: RevocationReceipt) -> str:
    domain, message = receipt.typed_message()
    return Account.recover_message(
        encode_typed_data(domain, RECEIPT_TYPES, message), signature=receipt.signature
    )


def verify_receipt(receipt: RevocationReceipt, expected_signer: str | None = None) -> bool:
    """True if the signature is valid for the receipt's contents and was made by
    `expected_signer` (or by the receipt's declared signer when not given)."""
    try:
        recovered = recover_receipt_signer(receipt)
    except Exception:
        return False
    expected = expected_signer or receipt.signer
    return recovered.lower() == expected.lower()


def _domain(chain_id: int, registry_address: str) -> dict:
    return {
        "name": DOMAIN_NAME,
        "version": DOMAIN_VERSION,
        "chainId": chain_id,
        "verifyingContract": to_checksum_address(registry_address),
    }
