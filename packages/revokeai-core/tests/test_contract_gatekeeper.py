"""End-to-end against the real RevokeConsentRegistry bytecode on an in-process EVM."""

import ast
from contextlib import contextmanager

import pytest
from eth_utils import keccak
from web3 import Web3
from web3.exceptions import ContractLogicError

from revokeai_core import (
    ContractGatekeeper,
    GatekeeperError,
    MemoryFilter,
    load_registry_abi,
    verify_receipt,
)

eth_tester = pytest.importorskip("eth_tester")


@pytest.fixture
def w3():
    return Web3(Web3.EthereumTesterProvider())


@pytest.fixture
def user(w3):
    return w3.eth.accounts[0]


@pytest.fixture
def stranger(w3):
    return w3.eth.accounts[1]


@pytest.fixture
def registry(w3, user, compiled_registry):
    factory = w3.eth.contract(abi=compiled_registry["abi"], bytecode=compiled_registry["bin"])
    receipt = w3.eth.wait_for_transaction_receipt(factory.constructor().transact({"from": user}))
    return w3.eth.contract(address=receipt.contractAddress, abi=compiled_registry["abi"])


@pytest.fixture
def session(w3, registry, user, parsed, session_id):
    tx = registry.functions.initSession(session_id, parsed.scope_hashes, parsed.labels).transact({"from": user})
    w3.eth.wait_for_transaction_receipt(tx)
    return session_id


def _send(w3, fn, sender):
    return w3.eth.wait_for_transaction_receipt(fn.transact({"from": sender}))


@contextmanager
def reverts_with(error_signature: str):
    """Assert the call reverts with a specific custom error (by 4-byte selector)."""
    selector = keccak(text=error_signature)[:4]
    with pytest.raises((ContractLogicError, eth_tester.exceptions.TransactionFailed)) as info:
        yield
    exc = info.value
    if isinstance(exc, ContractLogicError):
        data = bytes.fromhex(str(exc.data).removeprefix("0x"))
    else:  # eth-tester: "execution reverted: b'<raw revert data>'"
        data = ast.literal_eval(str(exc.args[0]).split("execution reverted: ", 1)[1])
    assert data[:4] == selector, f"expected {error_signature}"


def test_packaged_abi_matches_contract_source(compiled_registry):
    assert load_registry_abi() == compiled_registry["abi"]


def test_unrevoked_scope_passes_revoked_scope_is_stripped(w3, registry, user, parsed, session, signer):
    gatekeeper = ContractGatekeeper(w3, registry.address, expected_owner=user)
    hiv = parsed.by_label("Virology/HIV Screen")

    before = MemoryFilter(gatekeeper, signer).filter(session, parsed.scopes)
    assert before.allowed == parsed.scopes
    assert gatekeeper.check_scope_access(session, hiv.scope_hash) is True

    _send(w3, registry.functions.revokeScope(session, hiv.scope_hash), user)

    scope = registry.functions.getScope(session, hiv.scope_hash).call()
    assert scope[2] is True and scope[3] > 0  # isRevoked, revokedAt
    assert gatekeeper.check_scope_access(session, hiv.scope_hash) is False

    after = MemoryFilter(gatekeeper, signer).filter(session, parsed.scopes)
    context = after.render_context()
    assert after.stripped == (hiv,)
    assert "HIV" not in context and "Hepatitis" not in context
    assert parsed.by_label("Lipid Panel").content in context
    assert parsed.by_label("Billing Details").content in context


def test_batch_revoke_all_halts_with_receipt_bound_to_chain(w3, registry, user, parsed, session, signer):
    gatekeeper = ContractGatekeeper(w3, registry.address, expected_owner=user)
    _send(w3, registry.functions.batchRevokeScopes(session, parsed.scope_hashes), user)

    result = MemoryFilter(gatekeeper, signer).filter(session, parsed.scopes)

    assert result.halted and result.allowed == ()
    receipt = result.receipt
    assert receipt.chain_id == w3.eth.chain_id
    assert receipt.registry_address == registry.address
    assert receipt.block_number == w3.eth.block_number
    assert verify_receipt(receipt, expected_signer=signer.address)


def test_batch_revoke_is_idempotent(w3, registry, user, parsed, session):
    first = parsed.scope_hashes[0]
    _send(w3, registry.functions.revokeScope(session, first), user)
    _send(w3, registry.functions.batchRevokeScopes(session, parsed.scope_hashes), user)
    assert registry.functions.checkScopesAccess(session, parsed.scope_hashes).call() == [False] * 4


def test_end_session_denies_every_scope(w3, registry, user, parsed, session, signer):
    _send(w3, registry.functions.endSession(session), user)
    gatekeeper = ContractGatekeeper(w3, registry.address)
    assert MemoryFilter(gatekeeper, signer).filter(session, parsed.scopes).halted


def test_only_owner_can_revoke(registry, stranger, parsed, session):
    with reverts_with("NotSessionOwner(bytes32,address)"):
        registry.functions.revokeScope(session, parsed.scope_hashes[0]).transact({"from": stranger})


def test_duplicate_session_and_scope_rejected(registry, user, stranger, parsed, session, session_id):
    with reverts_with("SessionAlreadyExists(bytes32)"):
        registry.functions.initSession(session_id, parsed.scope_hashes, parsed.labels).transact({"from": stranger})
    dup = [parsed.scope_hashes[0]] * 2
    with reverts_with("DuplicateScope(bytes32)"):
        registry.functions.initSession(b"\x01" * 32, dup, ["a", "b"]).transact({"from": user})


def test_unknown_scope_denied(w3, registry, session):
    gatekeeper = ContractGatekeeper(w3, registry.address)
    assert gatekeeper.check_scope_access(session, b"\x99" * 32) is False


def test_session_owned_by_someone_else_is_denied(w3, registry, stranger, parsed, session_id, signer):
    # A front-runner registers the user's sessionId with the (public) scope hashes.
    _send(w3, registry.functions.initSession(session_id, parsed.scope_hashes, parsed.labels), stranger)
    expected_user = w3.eth.accounts[0]
    gatekeeper = ContractGatekeeper(w3, registry.address, expected_owner=expected_user)
    assert MemoryFilter(gatekeeper, signer).filter(session_id, parsed.scopes).halted


def test_unreachable_registry_raises(w3, parsed, session_id):
    gatekeeper = ContractGatekeeper(w3, "0x" + "ab" * 20)  # no code at this address
    with pytest.raises(GatekeeperError):
        gatekeeper.check_scopes(session_id, parsed.scope_hashes)


def test_denial_reasons_distinguish_revoked_ended_and_unregistered(w3, registry, user, stranger, parsed, session):
    from revokeai_core import DenialReason

    gatekeeper = ContractGatekeeper(w3, registry.address, expected_owner=user)
    hiv = parsed.by_label("Virology/HIV Screen").scope_hash
    _send(w3, registry.functions.revokeScope(session, hiv), user)

    snap = gatekeeper.check_scopes(session, [*parsed.scope_hashes, b"\x42" * 32])
    assert snap.reason(hiv) is DenialReason.REVOKED
    assert snap.reason(b"\x42" * 32) is DenialReason.NOT_REGISTERED
    assert snap.reason(parsed.by_label("Lipid Panel").scope_hash) is None

    assert gatekeeper.check_scopes(b"\x07" * 32, [hiv]).reason(hiv) is DenialReason.NOT_REGISTERED
    squatter_view = ContractGatekeeper(w3, registry.address, expected_owner=stranger)
    assert squatter_view.check_scopes(session, [hiv]).reason(hiv) is DenialReason.OWNER_MISMATCH

    _send(w3, registry.functions.endSession(session), user)
    ended = gatekeeper.check_scopes(session, parsed.scope_hashes)
    # The explicitly revoked scope keeps its reason; the rest are denied by the ended session.
    assert ended.reason(hiv) is DenialReason.REVOKED
    assert {ended.reason(h) for h in parsed.scope_hashes if h != hiv} == {DenialReason.SESSION_ENDED}
