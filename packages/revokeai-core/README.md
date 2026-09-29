# revokeai-core

A standalone Python SDK that gates every piece of document context an AI agent sees against on-chain consent in the `RevokeConsentRegistry` contract.

```
document ──► DocumentParser ──► scopes (label, content, salted keccak hash)
                                   │
                    user wallet ── initSession / revokeScope ──► RevokeConsentRegistry (MST)
                                   │                                     ▲
prompt  ◄── MemoryFilter ◄── ContractGatekeeper ── checkScopesAccess ────┘
   │           │
   │           └─ all denied ─► halt + EIP-712 signed RevocationReceipt
   └─ only consented scopes reach the LLM
```

## Components

| Module | What it does |
|---|---|
| `DocumentParser` | Detects headings (markdown `#`, `Heading:`, `ALL CAPS`), classifies sections with a keyword taxonomy (`Patient Identity`, `Lipid Panel`, `Virology/HIV Screen`, `Billing Details`, and others), merges sections that belong to the same scope, and hashes each scope. |
| `ContractGatekeeper` | Read-only web3.py client. Evaluates a whole context with a single `checkScopesAccess` call pinned to one block. It can also require that the session belongs to the expected user. |
| `MemoryFilter` | Drops denied scopes from the context. If none are left, it halts and returns a signed `RevocationReceipt` instead of context. |
| `ReceiptSigner` / `verify_receipt` | Signs receipts as EIP-712 typed data, bound to the chain ID and registry address, and verifies them. |
| `InMemoryAccessOracle` | An offline stand-in for the registry, for tests and local development. |

## Usage

```python
from revokeai_core import ContractGatekeeper, DocumentParser, MemoryFilter, ReceiptSigner

doc = DocumentParser().parse(record_text)
# Keep doc.salt secret and server-side. Send doc.scope_hashes and doc.labels to the
# user's wallet, which calls initSession(sessionId, scopeHashes, labels).

gatekeeper = ContractGatekeeper.from_rpc(
    "https://testnetrpc.mstblockchain.com", REGISTRY_ADDRESS, expected_owner=user_address
)
memory = MemoryFilter(gatekeeper, ReceiptSigner.from_env())  # reads REVOKEAI_SIGNER_KEY

result = memory.filter(session_id, doc.scopes)
if result.halted:
    return result.receipt.to_dict()   # signed proof that consent was withdrawn
prompt_context = result.render_context()  # contains consented scopes only
```

## Security model

- **Fail closed.** If the registry can't be read, `GatekeeperError` propagates and no context is released. Unknown scopes, unknown sessions and ended sessions are all denied.
- **Salted hashes.** Scope hashes are `keccak256(abi.encode(salt, label, content))` with a random 32-byte salt per document. Without the salt, public hashes of low-entropy results such as "HIV: Non-reactive" could be brute-forced.
- **Consistent snapshot.** Every decision for one prompt is read at the same block number, and that block is recorded in the receipt.
- **Protection against front-running.** Anyone can register any `sessionId`. With `expected_owner` set, a session that belongs to anyone else is treated as fully denied.
- **Gateway holds no user keys.** The gatekeeper only reads consent state. The receipt-signing key comes from `REVOKEAI_SIGNER_KEY`; it can only sign receipts and has no authority over consent.
- **Labels are public on-chain.** The contract stores `label` in plaintext. Scope names therefore reveal document structure (for example that a "Virology/HIV Screen" section exists), though not its content. For production, register generic category codes instead.

## Development

```powershell
cd packages/revokeai-core
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[test]"
pytest -v
```

The contract tests compile `../revokeai-contracts/contracts/RevokeConsentRegistry.sol` with solc 0.8.28 (downloaded on first run) and deploy it to an in-process py-evm chain. A test fails if the packaged ABI drifts from the contract source. To regenerate the ABI after changing the contract:

```powershell
python -c "import solcx, json; (_, a), = solcx.compile_files(['../revokeai-contracts/contracts/RevokeConsentRegistry.sol'], output_values=['abi'], solc_version='0.8.28').items(); json.dump(a['abi'], open('src/revokeai_core/abi/RevokeConsentRegistry.json', 'w'), indent=2)"
```
