import { Ban, BrainCircuit, Check, ExternalLink, Fingerprint, Layers, RefreshCw, ShieldOff, Sparkles, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { sensitivityOf, shortHex } from '../config'
import type { ActiveSession, ScopeView } from '../hooks/useRevokeAI'
import { SensitivityTag } from './SensitivityTag'
import { StatusBadge } from './StatusBadge'

interface Props {
  session: ActiveSession | null
  lastUsed: string[]
  onRevoke: (hashes: string[]) => void
  onEndSession: () => void
  onRefresh: () => void
  /** Mobile sheet state; ignored on large screens where the drawer is docked. */
  open: boolean
  onClose: () => void
}

export function ScopeDrawer({ session, lastUsed, onRevoke, onEndSession, onRefresh, open, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmEnd, setConfirmEnd] = useState(false)
  const active = session?.stage === 'active'
  const scopes = active ? session.scopes : []
  const busy = scopes.some((s) => s.state === 'revoking')
  const liveCount = scopes.filter((s) => s.state === 'active').length
  const revokedCount = scopes.filter((s) => s.state === 'revoked' || s.state === 'ended').length
  const stillHeld = lastUsed.filter((l) => scopes.some((s) => s.label === l && s.state === 'active'))

  const toggle = (hash: string) =>
    setSelected((sel) => {
      const next = new Set(sel)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })

  // Only scopes that are still revocable count as selected.
  const selectedList = scopes.filter((s) => s.state === 'active' && selected.has(s.scopeHash)).map((s) => s.scopeHash)

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b border-white/[0.06] p-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400/25 via-violet-400/25 to-fuchsia-400/25 ring-1 ring-white/10">
          <BrainCircuit className="size-4.5 text-violet-100" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Active Agent Data Scopes</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {active ? `Memory checklist · ${liveCount} active · ${revokedCount} revoked` : 'Post-task memory checklist'}
          </p>
        </div>
        {active && (
          <button onClick={onRefresh} title="Re-check consent" className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-100">
            <RefreshCw className="size-4" />
          </button>
        )}
        <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 lg:hidden" aria-label="Close scopes">
          <X className="size-4" />
        </button>
      </div>

      {!active ? (
        <EmptyDrawer />
      ) : (
        <>
          {stillHeld.length > 0 && (
            <p className="mx-4 mt-4 flex animate-fade-in gap-2 rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] px-3.5 py-2.5 text-xs text-sky-100/90">
              <Sparkles className="mt-px size-3.5 shrink-0 text-sky-300" />
              The agent just processed {stillHeld.join(', ')}. Task done? Revoke what it no longer needs.
            </p>
          )}
          <ul className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
            {scopes.map((s, i) => (
              <ScopeRow
                key={s.scopeHash}
                scope={s}
                index={i}
                usedLast={lastUsed.includes(s.label)}
                checked={selectedList.includes(s.scopeHash)}
                disabled={busy}
                onToggle={() => toggle(s.scopeHash)}
                onRevoke={() => onRevoke([s.scopeHash])}
              />
            ))}
          </ul>

          <div className="space-y-2 border-t border-white/[0.06] p-4">
            <button
              disabled={busy || selectedList.length === 0}
              onClick={() => {
                onRevoke(selectedList)
                setSelected(new Set())
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-3 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-white/[0.06] disabled:to-white/[0.06] disabled:text-zinc-500 disabled:shadow-none"
            >
              <ShieldOff className="size-4" />
              {selectedList.length > 1
                ? `Revoke ${selectedList.length} selected scopes`
                : selectedList.length === 1
                  ? 'Revoke selected scope'
                  : 'Select scopes to revoke together'}
            </button>
            {confirmEnd ? (
              <div className="flex animate-fade-in gap-2">
                <button onClick={() => setConfirmEnd(false)} className="flex-1 rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06]">
                  Keep session
                </button>
                <button
                  onClick={() => {
                    setConfirmEnd(false)
                    onEndSession()
                  }}
                  className="flex-1 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/25"
                >
                  Yes, end permanently
                </button>
              </div>
            ) : (
              <button
                disabled={busy || liveCount === 0}
                onClick={() => setConfirmEnd(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-zinc-400 transition hover:border-red-500/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Ban className="size-3.5" /> End session · revoke everything
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )

  return (
    <>
      {/* Docked on large screens */}
      <aside className="glass hidden min-h-0 w-[370px] shrink-0 animate-fade-in overflow-hidden rounded-[28px] lg:flex lg:flex-col">
        {body}
      </aside>
      {/* Bottom sheet on small screens */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] animate-slide-up flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0d0d16]">
            {body}
          </div>
        </div>
      )}
    </>
  )
}

function ScopeRow({
  scope,
  index,
  usedLast,
  checked,
  disabled,
  onToggle,
  onRevoke,
}: {
  scope: ScopeView
  index: number
  usedLast: boolean
  checked: boolean
  disabled: boolean
  onToggle: () => void
  onRevoke: () => void
}) {
  const revoked = scope.state === 'revoked' || scope.state === 'ended'
  const revocable = scope.state === 'active'
  const proofUrl = scope.proof?.explorerUrl

  return (
    <li
      className={`animate-slide-up rounded-2xl border p-3.5 transition-all duration-500 ${
        revoked
          ? 'border-red-500/25 bg-red-500/[0.04]'
          : scope.state === 'revoking'
            ? 'border-red-500/40 bg-red-500/[0.06]'
            : checked
              ? 'border-red-400/40 bg-red-500/[0.04]'
              : usedLast
                ? 'border-sky-400/30 bg-sky-400/[0.05]'
                : 'border-white/[0.06] bg-white/[0.035] hover:bg-white/[0.055]'
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-3">
        <button
          role="checkbox"
          aria-checked={checked}
          aria-label={`Select ${scope.label}`}
          disabled={!revocable || disabled}
          onClick={onToggle}
          className={`mt-0.5 grid size-4.5 shrink-0 place-items-center rounded border transition ${
            checked ? 'border-red-400 bg-red-500 text-white' : 'border-zinc-600 bg-zinc-950'
          } disabled:cursor-not-allowed disabled:opacity-30`}
        >
          {checked && <Check className="size-3" strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-sm font-medium transition ${revoked ? 'text-zinc-500 line-through decoration-red-400/60' : 'text-zinc-100'}`}>
              {scope.label}
            </span>
            <SensitivityTag kind={sensitivityOf(scope.label)} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge state={scope.state} />
            {revoked && proofUrl && (
              <a
                href={proofUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex animate-fade-in items-center gap-1 text-[11px] font-medium text-red-300/90 underline decoration-red-400/40 underline-offset-2 hover:text-red-200"
              >
                View proof <ExternalLink className="size-3" />
              </a>
            )}
            {usedLast && !revoked && scope.state !== 'revoking' && <span className="text-[10.5px] text-sky-300/80">used in last answer</span>}
          </div>
          {!revoked && <p className="mt-2 line-clamp-1 text-xs text-zinc-500">{scope.preview}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-zinc-600">
            <span className="inline-flex items-center gap-1">
              <Fingerprint className="size-3" /> {shortHex(scope.scopeHash, 8, 6)}
            </span>
            {revoked && scope.proof && <span className="animate-fade-in">tx {shortHex(scope.proof.txHash)}</span>}
          </div>
          {revoked && scope.purged && (
            <p className="mt-2 inline-flex animate-fade-in items-center gap-1.5 text-[11px] text-emerald-300/90">
              <Trash2 className="size-3" /> Purged from agent memory
            </p>
          )}
        </div>

        {revocable && (
          <button
            onClick={onRevoke}
            disabled={disabled}
            className="shrink-0 rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-500/10 disabled:hover:text-red-300"
          >
            Revoke Access
          </button>
        )}
      </div>
    </li>
  )
}

function EmptyDrawer() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="grid size-14 place-items-center rounded-full border border-dashed border-white/15 bg-white/[0.03]">
        <Layers className="size-5 text-zinc-500" />
      </div>
      <p className="mt-4 text-sm font-medium text-zinc-300">No document in the agent's memory</p>
      <p className="mt-1.5 max-w-60 text-xs leading-relaxed text-zinc-500">
        Upload a record and secure it. Every scope the agent can see appears here with a one-click revoke.
      </p>
    </div>
  )
}
