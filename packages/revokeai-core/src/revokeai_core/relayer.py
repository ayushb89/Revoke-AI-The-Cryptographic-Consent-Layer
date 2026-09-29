"""Gasless consent writes: a server-held relayer key signs and pays for
registry transactions on behalf of end users.

The relayer becomes the on-chain owner of every session it registers, so
consent custody moves to the platform operator (the B2B model). Callers must
authorise each relayed action themselves, e.g. with a per-session secret.
"""

import logging
import threading
from collections.abc import Sequence
from dataclasses import dataclass

from eth_account import Account
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from .gatekeeper import load_registry_abi

logger = logging.getLogger("revokeai.relayer")

# MST nodes reject priority fees below 1 gwei even though baseFee is 0.
MIN_PRIORITY_FEE_WEI = 1_000_000_000
GAS_HEADROOM = 1.2


class RelayerError(RuntimeError):
    """A relayed transaction could not be sent or did not succeed."""


@dataclass(frozen=True)
class RelayedTx:
    tx_hash: str
    block_number: int
    gas_used: int
    function: str


class ConsentRelayer:
    def __init__(
        self,
        w3: Web3,
        registry_address: str,
        private_key: str | bytes,
        *,
        receipt_timeout: float = 120.0,
    ) -> None:
        self._w3 = w3
        self._account = Account.from_key(private_key)
        self._contract = w3.eth.contract(address=Web3.to_checksum_address(registry_address), abi=load_registry_abi())
        self._timeout = receipt_timeout
        # Serialises nonce assignment + broadcast; confirmation waits run unlocked.
        self._send_lock = threading.Lock()
        self._chain_id: int | None = None

    @classmethod
    def from_rpc(cls, rpc_url: str, registry_address: str, private_key: str, timeout: float = 30.0) -> "ConsentRelayer":
        w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
        w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        return cls(w3, registry_address, private_key)

    @property
    def address(self) -> str:
        return self._account.address

    def balance_wei(self) -> int:
        return self._w3.eth.get_balance(self.address)

    # -- registry writes ------------------------------------------------------

    def init_session(self, session_id: bytes, scope_hashes: Sequence[bytes], labels: Sequence[str]) -> RelayedTx:
        return self._transact("initSession", session_id, list(scope_hashes), list(labels))

    def revoke_scopes(self, session_id: bytes, scope_hashes: Sequence[bytes]) -> RelayedTx:
        """Single scope → `revokeScope`; several → one `batchRevokeScopes` tx."""
        hashes = list(dict.fromkeys(scope_hashes))
        if len(hashes) == 1:
            return self._transact("revokeScope", session_id, hashes[0])
        return self._transact("batchRevokeScopes", session_id, hashes)

    def end_session(self, session_id: bytes) -> RelayedTx:
        return self._transact("endSession", session_id)

    # -- internals --------------------------------------------------------------

    def _transact(self, fn_name: str, *args) -> RelayedTx:
        fn = getattr(self._contract.functions, fn_name)(*args)
        try:
            with self._send_lock:
                tx_hash = self._sign_and_send(fn)
            receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self._timeout)
        except RelayerError:
            raise
        except Exception as exc:
            logger.warning("relayed %s failed: %s", fn_name, exc)
            raise RelayerError(_describe(exc)) from exc

        if receipt.status != 1:
            raise RelayerError(f"{fn_name} reverted on-chain (tx {_hex(tx_hash)})")
        logger.info("relayed %s in block %s (tx %s)", fn_name, receipt.blockNumber, _hex(tx_hash))
        return RelayedTx(_hex(tx_hash), receipt.blockNumber, receipt.gasUsed, fn_name)

    def _sign_and_send(self, fn) -> bytes:
        w3 = self._w3
        if self._chain_id is None:
            self._chain_id = w3.eth.chain_id
        sender = self.address
        # Simulate first so a revert (e.g. duplicate session) surfaces with its
        # reason instead of burning gas.
        gas = fn.estimate_gas({"from": sender})
        tip = max(w3.eth.max_priority_fee, MIN_PRIORITY_FEE_WEI)
        base = w3.eth.get_block("latest").get("baseFeePerGas", 0) or 0
        tx = fn.build_transaction({
            "from": sender,
            "chainId": self._chain_id,
            "nonce": w3.eth.get_transaction_count(sender, "pending"),
            "gas": int(gas * GAS_HEADROOM),
            "maxPriorityFeePerGas": tip,
            "maxFeePerGas": base * 2 + tip,
        })
        signed = self._account.sign_transaction(tx)
        return w3.eth.send_raw_transaction(signed.raw_transaction)


def _hex(b: bytes | str) -> str:
    s = b if isinstance(b, str) else b.hex()
    return s if s.startswith("0x") else "0x" + s


def _describe(exc: Exception) -> str:
    text = str(exc)
    if "insufficient funds" in text.lower():
        return "Relayer wallet has insufficient funds for gas"
    if "timeout" in type(exc).__name__.lower() or "not in the chain" in text.lower():
        return "Timed out waiting for the transaction to confirm"
    return f"Transaction failed: {type(exc).__name__}"
