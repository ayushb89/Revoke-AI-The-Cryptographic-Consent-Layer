import { FileText, Fingerprint, Gauge, Link2, MessageSquare, Radio, ShieldCheck, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'

import type { ActiveSession } from '../hooks/useRevokeAI'
import type { RevokeAIInfo } from '../lib/api'

interface Props {
  secure: boolean
  backendOk: boolean | null
  info?: RevokeAIInfo
  session: ActiveSession | null
  onSelectMode: (secure: boolean) => void
}

/**
 * Left navigation (large screens). The two mode tiles call the existing mode
 * switch; everything else is read-only status the app already knows.
 */
export function AppSidebar({ secure, backendOk, info, session, onSelectMode }: Props) {
  const active = session?.stage === 'active'
  const live = active ? session.scopes.filter((s) => s.state === 'active').length : 0
  const revoked = active ? session.scopes.filter((s) => s.state === 'revoked' || s.state === 'ended').length : 0
  const relayer = info?.relayer

  return (
    <aside className="hidden w-[272px] shrink-0 flex-col gap-3 lg:flex">
      {/* Brand bar */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-800/90 to-zinc-900/90 px-4 py-3.5 shadow-lg shadow-black/40">
        <div className="grid size-8 place-items-center rounded-xl bg-white/10">
          <ShieldCheck className="size-4.5 text-violet-200" />
        </div>
        <span className="text-[19px] font-semibold tracking-tight">
          Revoke<span className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-transparent">AI</span>
        </span>
        <span
          className={`ml-auto size-2 rounded-full ${backendOk ? 'bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/70' : backendOk === false ? 'bg-red-400' : 'bg-zinc-500'}`}
          title={backendOk ? 'Gateway online' : 'Gateway offline'}
        />
      </div>

      {/* Mode tiles */}
      <div className="glass grid grid-cols-2 gap-2 rounded-3xl p-2">
        <ModeTile icon={<MessageSquare className="size-4.5" />} label="Assistant" hint="Plain chat" selected={!secure} onClick={() => onSelectMode(false)} />
        <ModeTile icon={<ShieldCheck className="size-4.5" />} label="Secure" hint="RevokeAI on" selected={secure} onClick={() => onSelectMode(true)} dashed={!secure} />
      </div>

      {/* Live status */}
      <div className="glass scroll-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-3xl p-2">
        <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Workspace</p>
        <StatusRow icon={<Radio />} label="Gateway" value={backendOk ? 'Online' : backendOk === false ? 'Offline' : 'Checking…'} tone={backendOk ? 'good' : backendOk === false ? 'bad' : 'muted'} />
        <StatusRow icon={<Link2 />} label="Consent ledger" value={info?.network ?? '—'} />
        <StatusRow
          icon={<Wallet />}
          label="Gas relayer"
          value={!relayer ? '—' : !relayer.configured ? 'Not configured' : relayer.lowBalance ? 'Low balance' : 'Funded'}
          tone={!relayer ? 'muted' : !relayer.configured || relayer.lowBalance ? 'warn' : 'good'}
        />
        <StatusRow icon={<Fingerprint />} label="Receipts" value="EIP-712 signed" />
        <StatusRow icon={<FileText />} label="Document" value={active ? session.filename : secure ? 'None yet' : 'Secure mode off'} tone={active ? 'good' : 'muted'} />
        {active && <StatusRow icon={<Gauge />} label="Scopes" value={`${live} active · ${revoked} revoked`} tone={revoked ? 'warn' : 'good'} />}
      </div>

      {/* Tinted feature cards (the reference's pastel buttons, as dark glass) */}
      <div className="glass flex flex-col gap-2 rounded-3xl p-2">
        <Feature className="from-sky-400/15 to-sky-400/5 text-sky-100 ring-sky-300/15">No wallet needed</Feature>
        <Feature className="from-fuchsia-400/15 to-fuchsia-400/5 text-fuchsia-100 ring-fuchsia-300/15">Gasless consent on MST</Feature>
        <Feature className="from-lime-300/15 to-lime-300/5 text-lime-100 ring-lime-200/15">Verifiable revocation</Feature>
      </div>
    </aside>
  )
}

function ModeTile({
  icon,
  label,
  hint,
  selected,
  dashed,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint: string
  selected: boolean
  dashed?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-3 rounded-2xl px-3.5 py-3 text-left transition-all duration-300 ${
        selected
          ? 'tile-selected text-white'
          : `border ${dashed ? 'border-dashed border-violet-300/30' : 'border-white/[0.06]'} bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]`
      }`}
    >
      <span className={`grid size-8 place-items-center rounded-full ${selected ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{icon}</span>
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[11px] text-zinc-400">{hint}</span>
      </span>
    </button>
  )
}

function StatusRow({ icon, label, value, tone = 'muted' }: { icon: ReactNode; label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'muted' }) {
  const dot = { good: 'bg-emerald-400', warn: 'bg-amber-400', bad: 'bg-red-400', muted: 'bg-zinc-600' }[tone]
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.035] px-3.5 py-3">
      <span className="text-zinc-400 [&>svg]:size-4.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-zinc-200">{label}</span>
        <span className="block truncate text-[11.5px] text-zinc-500">{value}</span>
      </span>
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
    </div>
  )
}

function Feature({ children, className }: { children: ReactNode; className: string }) {
  return <div className={`rounded-2xl bg-gradient-to-b px-4 py-3 text-center text-[13.5px] ring-1 ${className}`}>{children}</div>
}
