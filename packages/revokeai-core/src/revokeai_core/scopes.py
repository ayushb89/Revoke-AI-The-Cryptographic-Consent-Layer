"""Data scope model and the salted scope-hash scheme."""

from dataclasses import dataclass

from eth_abi import encode
from eth_utils import keccak

SALT_BYTES = 32


def compute_scope_hash(salt: bytes, label: str, content: str) -> bytes:
    """keccak256(abi.encode(bytes32 salt, string label, string content)).

    The per-document secret salt is what keeps the public on-chain hash from
    being brute-forced for low-entropy content (e.g. "HIV-1/2 Ab: Non-reactive").
    The salt never leaves the SDK host. Solidity equivalent:
    `keccak256(abi.encode(salt, label, content))`.
    """
    if len(salt) != SALT_BYTES:
        raise ValueError(f"salt must be {SALT_BYTES} bytes")
    return keccak(encode(["bytes32", "string", "string"], [salt, label, content]))


@dataclass(frozen=True)
class DataScope:
    """One functional slice of a document, addressable on-chain by its hash."""

    label: str
    content: str
    scope_hash: bytes
    # Generic query terms that route questions to this scope. Not hashed and
    # never registered on-chain; they must not contain the scope's data.
    keywords: tuple[str, ...] = ()

    @property
    def scope_hash_hex(self) -> str:
        return "0x" + self.scope_hash.hex()
