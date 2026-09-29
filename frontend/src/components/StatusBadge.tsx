import { Ban, CircleDashed, LoaderCircle, ShieldAlert, ShieldX } from 'lucide-react'

import type { ScopeState } from '../hooks/useRevokeAI'

export function StatusBadge({ state }: { state: ScopeState }) {
  const base =
    'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-wide whitespace-nowrap'

  switch (state) {
    case 'active':
      return (
        <span key="active" className={`${base} animate-fade-in border-emerald-500/30 bg-emerald-500/10 text-emerald-300`}>
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
          </span>
          ACTIVE
        </span>
      )
    case 'pending':
      return (
        <span className={`${base} border-amber-500/30 bg-amber-500/10 text-amber-300`}>
          <CircleDashed className="size-3" />
          NOT SECURED
        </span>
      )
    case 'revoking':
      return (
        <span key="revoking" className={`${base} relative overflow-hidden border-red-500/40 bg-red-500/10 text-red-200`}>
          <LoaderCircle className="size-3 animate-spin" />
          SECURING ON-CHAIN…
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-scan bg-gradient-to-r from-transparent via-red-400/20 to-transparent" />
        </span>
      )
    case 'revoked':
      return (
        <span key="revoked" className={`${base} animate-pop border-red-500/50 bg-red-500/15 text-red-300 shadow-[0_0_18px_-4px] shadow-red-500/50`}>
          <ShieldX className="size-3" />
          REVOKED
        </span>
      )
    case 'ended':
      return (
        <span key="ended" className={`${base} animate-pop border-red-500/50 bg-red-500/15 text-red-300`}>
          <Ban className="size-3" />
          SESSION ENDED
        </span>
      )
    case 'mismatch':
      return (
        <span className={`${base} border-amber-500/30 bg-amber-500/10 text-amber-300`}>
          <ShieldAlert className="size-3" />
          UNVERIFIED
        </span>
      )
  }
}
