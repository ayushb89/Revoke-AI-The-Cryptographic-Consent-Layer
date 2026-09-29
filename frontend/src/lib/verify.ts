/**
 * Independent, read-only verification of gateway receipts. No wallet is
 * involved: signatures are checked locally and contract state is read over the
 * chain's public RPC advertised by the gateway.
 */
import { Contract, JsonRpcProvider, keccak256, solidityPacked, verifyTypedData } from 'ethers'

import type { RevocationReceipt } from './api'

const REGISTRY_ABI = [
  'function getScope(bytes32 sessionId, bytes32 scopeHash) view returns (tuple(bytes32 scopeHash, string label, bool isRevoked, uint256 revokedAt))',
]

const readers = new Map<string, JsonRpcProvider>()

function reader(rpcUrl: string, chainId: number): JsonRpcProvider {
  const key = `${chainId}@${rpcUrl}`
  let provider = readers.get(key)
  if (!provider) {
    provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true })
    readers.set(key, provider)
  }
  return provider
}

export interface OnChainScope {
  isRevoked: boolean
  revokedAt: number
}

export async function readScope(
  rpcUrl: string,
  chainId: number,
  registry: string,
  sessionId: string,
  scopeHash: string,
): Promise<OnChainScope> {
  const contract = new Contract(registry, REGISTRY_ABI, reader(rpcUrl, chainId))
  const scope = await contract.getScope(sessionId, scopeHash)
  return { isRevoked: Boolean(scope.isRevoked), revokedAt: Number(scope.revokedAt) }
}

export interface ReceiptCheck {
  recovered: string
  signatureValid: boolean
  rootMatches: boolean
  fromTrustedGateway: boolean | null
}

/** Recomputes the EIP-712 digest in the browser and recovers the signer. */
export function verifyReceipt(r: RevocationReceipt, trustedGateway?: string): ReceiptCheck {
  const sorted = r.revokedScopeHashes.map((h) => h.toLowerCase()).sort()
  const root = keccak256(solidityPacked(sorted.map(() => 'bytes32'), sorted))
  const recovered = verifyTypedData(
    { name: 'RevokeAI Gateway', version: '1', chainId: r.chainId, verifyingContract: r.registry },
    {
      RevocationReceipt: [
        { name: 'sessionId', type: 'bytes32' },
        { name: 'revokedScopesRoot', type: 'bytes32' },
        { name: 'blockNumber', type: 'uint256' },
        { name: 'issuedAt', type: 'uint256' },
      ],
    },
    { sessionId: r.sessionId, revokedScopesRoot: root, blockNumber: r.blockNumber, issuedAt: r.issuedAt },
    r.signature,
  )
  return {
    recovered,
    signatureValid: recovered.toLowerCase() === r.signer.toLowerCase(),
    rootMatches: root === r.revokedScopesRoot.toLowerCase(),
    fromTrustedGateway: trustedGateway ? recovered.toLowerCase() === trustedGateway.toLowerCase() : null,
  }
}
