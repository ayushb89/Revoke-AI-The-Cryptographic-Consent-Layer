"""End-to-end verification of the gasless RevokeAI consent pipeline.

    upload report → relayer registers consent → full-access Gemini query
    → relayer revokes a scope → same query is blocked (403) before Gemini

Runs the real FastAPI app in-process and the real Gemini client. No user wallet
is involved: every on-chain write goes through the /api/relayer/* endpoints.

  --chain local (default)  deploy RevokeConsentRegistry to an in-process EVM and
                           fund a throwaway relayer. Needs backend/requirements-dev.txt.
  --chain mst              use the live registry on MST Testnet with the relayer key
                           from backend/.env (REVOKEAI_RELAYER_PRIVATE_KEY or
                           MST_USER_PRIVATE_KEY). Sends 2 real transactions.

  --stub-llm               replace Gemini with a canned reply (offline/CI).

Run from the repo root with the backend venv:
    backend/.venv/Scripts/python scripts/test_revoke_flow.py
    backend/.venv/Scripts/python scripts/test_revoke_flow.py --chain mst
"""

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from eth_account import Account  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from web3 import Web3  # noqa: E402

from app.config import MST_TESTNET_CHAIN_ID, settings  # noqa: E402
from app.extensions.revokeai import SESSION_TOKEN_HEADER, RevokeAIExtension  # noqa: E402
from app.gemini_client import GeminiReply  # noqa: E402
from app.main import create_app  # noqa: E402
from revokeai_core import (  # noqa: E402
    ConsentRelayer,
    ContractGatekeeper,
    ReceiptSigner,
    RevocationReceipt,
    verify_receipt,
)

REPORT = ROOT / "scripts" / "fixtures" / "mock_medical_report.md"
CONTRACT = ROOT / "packages" / "revokeai-contracts" / "contracts" / "RevokeConsentRegistry.sol"
HIV = "Virology/HIV Screen"
Q_HIV = "What was the result of my HIV screen?"
Q_LIPID = "Is my LDL cholesterol in a healthy range?"


def local_chain() -> tuple[ContractGatekeeper, ConsentRelayer, str, str | None]:
    import solcx

    solcx.install_solc("0.8.28")
    (_, art), = solcx.compile_files(
        [str(CONTRACT)], output_values=["abi", "bin"], solc_version="0.8.28", optimize=True, evm_version="cancun"
    ).items()
    w3 = Web3(Web3.EthereumTesterProvider())
    deployer = w3.eth.accounts[0]
    tx = w3.eth.contract(abi=art["abi"], bytecode=art["bin"]).constructor().transact({"from": deployer})
    registry = w3.eth.wait_for_transaction_receipt(tx).contractAddress
    relayer = ConsentRelayer(w3, registry, Account.create().key)
    w3.eth.wait_for_transaction_receipt(
        w3.eth.send_transaction({"from": deployer, "to": relayer.address, "value": Web3.to_wei(1, "ether")})
    )
    return ContractGatekeeper(w3, registry), relayer, registry, None


def mst_chain() -> tuple[ContractGatekeeper, ConsentRelayer, str, str | None]:
    key = settings.revokeai_relayer_key
    if not key:
        sys.exit("No relayer key: set REVOKEAI_RELAYER_PRIVATE_KEY (or MST_USER_PRIVATE_KEY) in backend/.env.")
    gate = ContractGatekeeper.from_rpc(settings.revokeai_rpc_url, settings.revokeai_registry_address)
    assert gate.chain_id == MST_TESTNET_CHAIN_ID, "RPC is not MST Testnet"
    relayer = ConsentRelayer.from_rpc(settings.revokeai_rpc_url, settings.revokeai_registry_address, key)
    return gate, relayer, settings.revokeai_registry_address, settings.revokeai_explorer_url


class GeminiSpy:
    """Proves whether a request reached the LLM."""

    def __init__(self, inner, stub: bool) -> None:
        self.inner, self.stub, self.calls = inner, stub, 0
        self.model = "stub" if stub else inner.model

    async def reply(self, history, message, context=None):
        self.calls += 1
        if self.stub:
            labels = [line[1:-1] for line in (context or "").splitlines() if line.startswith("[")]
            return GeminiReply(
                f"(stub) answered from: {', '.join(labels)}",
                f"(stub) User asked a question; used scopes: {', '.join(labels) or 'none'}.",
            )
        return await self.inner.reply(history, message, context=context)

    async def aclose(self):
        await self.inner.aclose()


def step(n: int, text: str) -> None:
    print(f"\n[{n}] {text}")


def ok(text: str) -> None:
    print(f"    PASS  {text}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chain", choices=["local", "mst"], default="local")
    ap.add_argument("--stub-llm", action="store_true")
    args = ap.parse_args()
    if not args.stub_llm and not settings.gemini_configured:
        sys.exit("GEMINI_API_KEY is not set (backend/.env). Use --stub-llm to run without Gemini.")

    gate, relayer, registry, explorer = local_chain() if args.chain == "local" else mst_chain()
    signer = ReceiptSigner(Account.create().key)
    app = create_app(extensions=[
        RevokeAIExtension(gate, signer, relayer, registry_address=registry, explorer_url=explorer)
    ])
    print(f"chain={args.chain}  registry={registry}  relayer={relayer.address}")

    with TestClient(app) as client:
        spy = GeminiSpy(app.state.gemini, stub=args.stub_llm)
        app.state.gemini = spy

        step(1, "Default mode: plain chat, no document, no blockchain")
        r = client.post("/api/chat", json={"message": "Reply with exactly: pong"})
        assert r.status_code == 200 and r.json()["extensions"] is None, r.text
        ok(f"plain reply: {r.json()['reply'].strip()[:60]!r}")

        step(2, "Secure mode: upload mock medical report (no wallet, no address)")
        with REPORT.open("rb") as fh:
            r = client.post("/api/documents/upload", files={"file": (REPORT.name, fh, "text/markdown")})
        assert r.status_code == 200, r.text
        up = r.json()
        sid, headers = up["sessionId"], {SESSION_TOKEN_HEADER: up["sessionToken"]}
        scopes = {s["label"]: s["scopeHash"] for s in up["scopes"]}
        assert list(scopes) == ["Patient Identity", "Lipid Panel", HIV, "Billing Details"], scopes
        assert "transaction" not in up
        ok(f"{len(scopes)} scopes: {', '.join(scopes)}")

        step(3, "Before registration, document questions are refused")
        calls = spy.calls
        r = client.post("/api/chat", json={"message": Q_HIV, "sessionId": sid}, headers=headers)
        assert r.status_code == 403 and r.json()["reason"] == "not_registered", r.text
        assert spy.calls == calls
        ok(r.json()["message"])

        step(4, "POST /api/relayer/initSession (relayer signs + pays gas)")
        assert client.post("/api/relayer/initSession", json={"sessionId": sid}).status_code == 401
        r = client.post("/api/relayer/initSession", json={"sessionId": sid}, headers=headers)
        assert r.status_code == 200, r.text
        init = r.json()
        assert init["function"] == "initSession" and init["scopeCount"] == 4
        ok(f"registered in block {init['blockNumber']}  tx {init['txHash']}")
        if init["explorerUrl"]:
            print(f"      {init['explorerUrl']}")
        again = client.post("/api/relayer/initSession", json={"sessionId": sid}, headers=headers).json()
        assert again["txHash"] == init["txHash"]
        ok("idempotent: a repeat call returns the same tx, no second transaction")

        step(5, f"Full-access query: {Q_HIV!r}")
        calls = spy.calls
        r = client.post("/api/chat", json={"message": Q_HIV, "sessionId": sid}, headers=headers)
        assert r.status_code == 200, r.text
        first = r.json()
        meta = first["extensions"]["revokeai"]
        assert meta["scopesUsed"] == [HIV] and meta["scopesWithheld"] == []
        assert spy.calls == calls + 1
        ok(f"Gemini called once with only [{HIV}] in context (block {meta['blockNumber']})")
        print(f"      Gemini: {first['reply'].strip()[:200]}")
        assert first.get("reasoning"), "normal replies carry model reasoning"
        print(f"      reasoning: {first['reasoning'][:200]}")

        step(6, f"POST /api/relayer/revokeScope [{HIV}]")
        r = client.post("/api/relayer/revokeScope", json={"sessionId": sid, "scopeHashes": [scopes[HIV]]}, headers=headers)
        assert r.status_code == 200, r.text
        rev = r.json()["revoked"][0]
        assert rev["function"] == "revokeScope" and rev["scopeHash"] == scopes[HIV]
        ok(f"revoked in block {rev['blockNumber']}  tx {rev['txHash']}")
        if rev["explorerUrl"]:
            print(f"      {rev['explorerUrl']}")

        step(7, f"Retry revoked query: {Q_HIV!r}")
        calls = spy.calls
        r = client.post("/api/chat", json={"message": Q_HIV, "sessionId": sid}, headers=headers)
        body = r.json()
        assert r.status_code == 403 and body["status"] == "blocked", r.text
        assert body["message"] == f"Access Denied: Permission for {HIV} was permanently revoked on MST Blockchain."
        assert spy.calls == calls, "Gemini must not be called for a revoked scope"
        ok(f"403 {body['message']}")
        assert body["reasoning"].startswith("Query intercepted by Gatekeeper.")
        assert f"'{HIV}' scope" in body["reasoning"] and body["reasoning"].endswith("Execution halted before reaching the LLM.")
        ok(f"reasoning: {body['reasoning']}")
        ok("Gemini API was NOT called")
        receipt = RevocationReceipt.from_dict(body["receipt"])
        assert verify_receipt(receipt, expected_signer=signer.address)
        ok(f"signed revocation receipt verifies (block {receipt.block_number})")

        step(8, f"Unrevoked scope still works; earlier HIV answer scrubbed: {Q_LIPID!r}")
        r = client.post("/api/chat", json={"message": Q_LIPID, "sessionId": sid, "history": first["history"]},
                        headers=headers)
        assert r.status_code == 200, r.text
        second = r.json()
        meta = second["extensions"]["revokeai"]
        assert meta["scopesUsed"] == ["Lipid Panel"]
        assert {"label": HIV, "reason": "revoked"} in meta["scopesWithheld"]
        assert meta["historyTurnsRedacted"] == 1
        assert first["reply"] not in [t["content"] for t in second["history"]]
        ok("Lipid Panel answered; revoked HIV answer redacted from history")
        print(f"      Gemini: {second['reply'].strip()[:200]}")

        step(9, "Memory hygiene + status")
        status = {s["label"]: s for s in client.get(f"/api/documents/{sid}", headers=headers).json()["scopes"]}
        assert status[HIV]["allowed"] is False and status[HIV]["purgedFromMemory"] is True
        assert status[HIV]["revocation"]["txHash"] == rev["txHash"]
        assert status["Lipid Panel"]["allowed"] is True and status["Lipid Panel"]["purgedFromMemory"] is False
        ok("revoked scope deleted from server memory; others retained")

        step(10, "Authorisation: relayer writes need the session token")
        r = client.post("/api/relayer/revokeScope", json={"sessionId": sid, "scopeHashes": [scopes["Lipid Panel"]]})
        assert r.status_code == 401
        r = client.post("/api/chat", json={"message": Q_LIPID, "sessionId": sid})
        assert r.status_code == 401
        ok("401 without token (sessionId alone is public on-chain)")

    print(f"\nALL CHECKS PASSED  ({spy.calls} Gemini calls, chain={args.chain})")
    return 0


if __name__ == "__main__":
    t0 = time.time()
    code = main()
    print(f"done in {time.time() - t0:.1f}s")
    sys.exit(code)
