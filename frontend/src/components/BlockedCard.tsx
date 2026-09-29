import {
  Braces,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  LoaderCircle,
  ShieldX,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { shortHex } from '../config'
import type { BlockedResponse, RevokeAIInfo } from '../lib/api'
import { readScope, verifyReceipt } from '../lib/verify'
import type { OnChainScope } from '../lib/verify'
import { useToast } from './toast-context'

type Check = 'pending' | 'pass' | 'fail'

export function BlockedCard({ data, info }: { data: BlockedResponse; info?: RevokeAIInfo }) {
  const trustedGateway = info?.receiptSigner
  const explorer = info?.explorerUrl
  const toast = useToast()
  const [showJson, setShowJson] = useState(false)
  const [chain, setChain] = useState<Record<string, OnChainScope | 'error'>>({})
  const receipt = data.receipt
  const consentMissing = data.reason === 'not_registered' || data.reason === 'owner_mismatch'

  const sig = useMemo(() => {
    if (!receipt) return null
    try {
      return verifyReceipt(receipt, trustedGateway)
    } catch {
      return null
    }
  }, [receipt, trustedGateway])

  // Independently read each denied scope straight from the registry contract.
  const rpcUrl = info?.rpcUrl
  useEffect(() => {
    if (!receipt || !rpcUrl) return
    let live = true
    for (const s of data.deniedScopes) {
      readScope(rpcUrl, data.chainId, data.registry, receipt.sessionId, s.scopeHash)
        .then((v) => live && setChain((c) => ({ ...c, [s.scopeHash]: v })))
        .catch(() => live && setChain((c) => ({ ...c, [s.scopeHash]: 'error' })))
    }
    return () => {
      live = false
    }
  }, [data, receipt, rpcUrl])

  const sigCheck: Check = !receipt ? 'fail' : sig === null ? 'fail' : sig.signatureValid && sig.rootMatches && sig.fromTrustedGateway !== false ? 'pass' : 'fail'

  return (
    <div className="relative animate-shake overflow-hidden rounded-2xl border border-red-500/40 bg-gradient-to-b from-red-500/[0.12] to-red-500/[0.03] shadow-[0_0_40px_-12px] shadow-red-500/40">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-red-500/40 bg-red-500/15">
          <ShieldX className="size-5 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-widest text-red-400/80 uppercase">
            {consentMissing ? 'Consent required · RevokeAI Gatekeeper' : 'Access denied · RevokeAI Gatekeeper'}
          </p>
          <p className="mt-1 text-[15px] leading-snug font-medium text-red-50">{data.message}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {data.deniedScopes.map((s) => (
              <span key={s.scopeHash} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-200">
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-red-500/20 bg-zinc-950/50 px-4 py-3.5 sm:px-5">
        <p className="mb-2.5 text-[11px] tracking-wider text-zinc-500 uppercase">Verified rejection receipt</p>
        <div className="space-y-2">
          <CheckRow status="pass" label="LLM call">
            Not made: request stopped at the gateway before reaching Gemini
          </CheckRow>
          {data.deniedScopes.map((s) => {
            const v = chain[s.scopeHash]
            const status: Check = v === undefined ? 'pending' : v === 'error' ? 'fail' : v.isRevoked === (s.reason === 'revoked') ? 'pass' : 'fail'
            return (
              <CheckRow key={s.scopeHash} status={status} label={`On-chain · ${s.label}`}>
                {v === undefined
                  ? rpcUrl ? 'Reading the consent ledger…' : 'Ledger endpoint unavailable'
                  : v === 'error'
                    ? 'Could not reach the ledger'
                    : v.isRevoked
                      ? `isRevoked = true · revoked ${new Date(v.revokedAt * 1000).toLocaleString()}`
                      : s.reason === 'session_ended'
                        ? 'Session ended on-chain'
                        : 'No consent registered for this scope'}
              </CheckRow>
            )
          })}
          <CheckRow status={sigCheck} label="Gateway signature">
            {sig
              ? `EIP-712 signer ${shortHex(sig.recovered)}${sig.fromTrustedGateway ? ' · matches gateway key' : sig.fromTrustedGateway === false ? ' · UNKNOWN signer' : ''}`
              : 'Signature could not be verified'}
          </CheckRow>
        </div>

        {receipt && (
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-zinc-500">
            {explorer ? (
              <a href={`${explorer}/block/${receipt.blockNumber}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-300">
                block #{receipt.blockNumber} <ExternalLink className="size-3" />
              </a>
            ) : (
              <span>block #{receipt.blockNumber}</span>
            )}
            {explorer ? (
              <a href={`${explorer}/address/${receipt.registry}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-300">
                registry {shortHex(receipt.registry)} <ExternalLink className="size-3" />
              </a>
            ) : (
              <span>registry {shortHex(receipt.registry)}</span>
            )}
            <span>session {shortHex(receipt.sessionId, 8, 6)}</span>
            <button onClick={() => setShowJson((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
              <Braces className="size-3" /> receipt
              <ChevronDown className={`size-3 transition ${showJson ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
        {receipt && showJson && (
          <div className="relative mt-2.5 animate-fade-in">
            <pre className="scroll-thin max-h-64 overflow-auto rounded-lg border border-white/5 bg-black/60 p-3 pr-10 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-zinc-400">
              {JSON.stringify(receipt, null, 2)}
            </pre>
            <button
              onClick={() =>
                void navigator.clipboard?.writeText(JSON.stringify(receipt, null, 2)).then(
                  () => toast('info', 'Receipt copied'),
                  () => toast('error', 'Could not copy receipt'),
                )
              }
              className="absolute top-2 right-2 rounded-md border border-white/10 bg-zinc-900 p-1.5 text-zinc-400 hover:text-zinc-200"
              aria-label="Copy receipt JSON"
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckRow({ status, label, children }: { status: Check; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-xs">
      {status === 'pending' ? (
        <LoaderCircle className="mt-px size-3.5 shrink-0 animate-spin text-zinc-500" />
      ) : status === 'pass' ? (
        <CheckCircle2 className="mt-px size-3.5 shrink-0 animate-pop text-emerald-400" />
      ) : (
        <XCircle className="mt-px size-3.5 shrink-0 text-amber-400" />
      )}
      <span className="w-40 shrink-0 text-zinc-400 max-sm:w-28">{label}</span>
      <span className="min-w-0 break-words text-zinc-300">{children}</span>
    </div>
  )
}
