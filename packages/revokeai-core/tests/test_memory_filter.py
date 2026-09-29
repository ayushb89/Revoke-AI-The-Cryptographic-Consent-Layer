"""MemoryFilter behaviour against the in-memory oracle (no chain needed)."""

import dataclasses

import pytest

from revokeai_core import GatekeeperError, InMemoryAccessOracle, MemoryFilter, verify_receipt


@pytest.fixture
def oracle(parsed, session_id):
    o = InMemoryAccessOracle()
    o.init_session(session_id, parsed.scope_hashes)
    return o


def test_unrevoked_scopes_pass_through(oracle, signer, parsed, session_id):
    result = MemoryFilter(oracle, signer).filter(session_id, parsed.scopes)

    assert result.allowed == parsed.scopes
    assert result.stripped == ()
    assert not result.halted
    for scope in parsed.scopes:
        assert scope.content in result.render_context()


def test_revoked_scope_is_completely_stripped(oracle, signer, parsed, session_id):
    hiv = parsed.by_label("Virology/HIV Screen")
    oracle.revoke(session_id, hiv.scope_hash)

    result = MemoryFilter(oracle, signer).filter(session_id, parsed.scopes)
    context = result.render_context()

    assert result.stripped == (hiv,)
    assert hiv not in result.allowed
    assert "HIV" not in context and "Hepatitis" not in context and "Virology" not in context
    assert parsed.by_label("Lipid Panel").content in context


def test_all_revoked_halts_with_verifiable_receipt(oracle, signer, parsed, session_id):
    oracle.revoke(session_id, *parsed.scope_hashes)

    result = MemoryFilter(oracle, signer).filter(session_id, parsed.scopes)

    assert result.halted and result.allowed == ()
    with pytest.raises(RuntimeError):
        result.render_context()
    receipt = result.receipt
    assert receipt.session_id == session_id
    assert set(receipt.revoked_scope_hashes) == set(parsed.scope_hashes)
    assert receipt.block_number == result.snapshot.block_number
    assert verify_receipt(receipt, expected_signer=signer.address)


def test_tampered_receipt_fails_verification(oracle, signer, parsed, session_id):
    oracle.revoke(session_id, *parsed.scope_hashes)
    receipt = MemoryFilter(oracle, signer).filter(session_id, parsed.scopes).receipt

    forged = dataclasses.replace(receipt, revoked_scope_hashes=receipt.revoked_scope_hashes[:1])
    assert not verify_receipt(forged, expected_signer=signer.address)
    assert not verify_receipt(dataclasses.replace(receipt, block_number=receipt.block_number + 1))
    assert not verify_receipt(receipt, expected_signer="0x" + "22" * 20)


def test_ended_session_denies_everything(oracle, signer, parsed, session_id):
    oracle.end_session(session_id)
    assert MemoryFilter(oracle, signer).filter(session_id, parsed.scopes).halted


def test_unknown_session_or_scope_is_denied(signer, parsed, session_id):
    result = MemoryFilter(InMemoryAccessOracle(), signer).filter(session_id, parsed.scopes)
    assert result.halted and result.stripped == parsed.scopes


def test_oracle_failure_fails_closed(signer, parsed, session_id):
    class DownOracle:
        def check_scopes(self, *_):
            raise GatekeeperError("rpc down")

    with pytest.raises(GatekeeperError):
        MemoryFilter(DownOracle(), signer).filter(session_id, parsed.scopes)


def test_expected_owner_mismatch_denies(signer, parsed, session_id):
    from revokeai_core import DenialReason

    oracle = InMemoryAccessOracle()
    oracle.init_session(session_id, parsed.scope_hashes, owner="0x" + "aa" * 20)
    mf = MemoryFilter(oracle, signer)
    assert not mf.filter(session_id, parsed.scopes, expected_owner="0x" + "aa" * 20).halted
    result = mf.filter(session_id, parsed.scopes, expected_owner="0x" + "bb" * 20)
    assert result.halted
    assert result.snapshot.reason(parsed.scope_hashes[0]) is DenialReason.OWNER_MISMATCH


def test_receipt_json_round_trip_still_verifies(oracle, signer, parsed, session_id):
    from revokeai_core import RevocationReceipt

    oracle.revoke(session_id, *parsed.scope_hashes)
    receipt = MemoryFilter(oracle, signer).filter(session_id, parsed.scopes).receipt
    restored = RevocationReceipt.from_dict(receipt.to_dict())
    assert restored == receipt
    assert verify_receipt(restored, expected_signer=signer.address)
