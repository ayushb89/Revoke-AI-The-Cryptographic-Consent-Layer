"""ConsentRelayer against the real registry on an in-process EVM."""

import pytest
from eth_account import Account
from web3 import Web3

from revokeai_core import ConsentRelayer, ContractGatekeeper, DenialReason, RelayerError

pytest.importorskip("eth_tester")


@pytest.fixture
def w3():
    return Web3(Web3.EthereumTesterProvider())


@pytest.fixture
def registry(w3, compiled_registry):
    factory = w3.eth.contract(abi=compiled_registry["abi"], bytecode=compiled_registry["bin"])
    r = w3.eth.wait_for_transaction_receipt(factory.constructor().transact({"from": w3.eth.accounts[0]}))
    return r.contractAddress


@pytest.fixture
def relayer(w3, registry):
    key = Account.create().key
    relayer = ConsentRelayer(w3, registry, key)
    w3.eth.wait_for_transaction_receipt(
        w3.eth.send_transaction({"from": w3.eth.accounts[0], "to": relayer.address, "value": Web3.to_wei(1, "ether")})
    )
    return relayer


def test_relayer_registers_and_revokes_without_user_wallet(w3, registry, relayer, parsed, session_id):
    gate = ContractGatekeeper(w3, registry)

    tx = relayer.init_session(session_id, parsed.scope_hashes, parsed.labels)
    assert tx.function == "initSession" and tx.tx_hash.startswith("0x") and tx.block_number > 0
    snap = gate.check_scopes(session_id, parsed.scope_hashes, expected_owner=relayer.address)
    assert all(snap.is_allowed(h) for h in parsed.scope_hashes)

    hiv = parsed.by_label("Virology/HIV Screen").scope_hash
    assert relayer.revoke_scopes(session_id, [hiv]).function == "revokeScope"
    assert gate.check_scopes(session_id, [hiv]).reason(hiv) is DenialReason.REVOKED

    rest = [h for h in parsed.scope_hashes if h != hiv]
    assert relayer.revoke_scopes(session_id, rest).function == "batchRevokeScopes"
    assert not any(gate.check_scopes(session_id, parsed.scope_hashes).decisions.values())


def test_revert_is_reported_without_sending(relayer, parsed, session_id):
    relayer.init_session(session_id, parsed.scope_hashes, parsed.labels)
    with pytest.raises(RelayerError):
        relayer.init_session(session_id, parsed.scope_hashes, parsed.labels)  # duplicate session


def test_unfunded_relayer_fails_cleanly(w3, registry, parsed, session_id):
    broke = ConsentRelayer(w3, registry, Account.create().key)
    with pytest.raises(RelayerError):
        broke.init_session(session_id, parsed.scope_hashes, parsed.labels)
