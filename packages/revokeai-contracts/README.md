# @revokeai/contracts

`RevokeConsentRegistry` stores per-session, per-scope consent for RevokeAI. The project uses Hardhat 3, Solidity 0.8.28 and the Cancun EVM version.

## Contract API

| Function | Who | Effect |
|---|---|---|
| `initSession(sessionId, scopeHashes[], labels[])` | anyone (becomes the owner) | Registers up to 256 scopes. Reverts on a duplicate session, a duplicate scope or a zero hash. |
| `revokeScope(sessionId, scopeHash)` | owner | Revokes one scope and records `revokedAt`. |
| `batchRevokeScopes(sessionId, scopeHashes[])` | owner | Revokes many scopes in one transaction, skipping any already revoked. |
| `endSession(sessionId)` | owner | Kill switch that denies every scope. |
| `checkScopeAccess(sessionId, scopeHash)` | view | `true` only if the session is active and the scope exists and isn't revoked. |
| `checkScopesAccess(sessionId, scopeHashes[])` | view | Batched check; the gateway uses this. |
| `getSession`, `getScope`, `getSessionScopeHashes` | view | State readers. |

Revocation can't be undone. To grant access again, start a new session.

## MST Testnet

| | |
|---|---|
| Chain ID | `91562037` |
| RPC | `https://testnetrpc.mstblockchain.com` (override with `MST_TESTNET_RPC_URL`) |
| Currency | tMSTC ([faucet](https://faucet.mstblockchain.com)) |
| Explorer | https://testnet.mstscan.com |

These values come from the ethereum-lists chain registry (`eip155-91562037`) and were checked against the live RPC.

## Commands

```powershell
cd packages/revokeai-contracts
npm install
npm test                    # node:test + viem against the in-process Hardhat chain
npm run deploy:local        # rehearse the Ignition deployment in-process

# Store the deployer key in Hardhat's encrypted keystore (you'll be prompted; it is never written to disk in plaintext)
npx hardhat keystore set MST_DEPLOYER_PRIVATE_KEY
npm run deploy:mst          # scripts/deploy.ts → deployments/91562037.json
```

`deploy:mst` uses [scripts/deploy.ts](scripts/deploy.ts) rather than Ignition. MST blocks report `baseFeePerGas = 0`, and Ignition reads that as a zero-fee chain and sends a priority fee of 0. MST nodes reject that with the error `gas tip cap 0, minimum needed 1000000000`. The script takes the node's suggested tip, never goes below 1 gwei, and records the deployed address in `deployments/<chainId>.json`.

Use a dedicated, testnet-only deployer wallet funded from the faucet. Never reuse a key that holds real funds.
