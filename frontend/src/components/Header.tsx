import { FileText, MessageSquare, ShieldCheck } from 'lucide-react'

import { currentUser } from '../lib/auth'

interface Props {
  backendOk: boolean | null
  secure: boolean
  secureAvailable: boolean
  onToggleSecure: () => void
  /** Optional description of what the chat is currently about (display only). */
  context?: string
}

export function Header({ backendOk, secure, secureAvailable, onToggleSecure, context }: Props) {
  const user = currentUser()
  return (
    <header className="flex shrink-0 items-center gap-3">
      {/* Brand, only when the sidebar is hidden */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="grid size-9 place-items-center rounded-xl border border-white/10 bg-zinc-800/80">
          <ShieldCheck className="size-4.5 text-violet-200" />
        </div>
        <span className="hidden text-[17px] font-semibold tracking-tight sm:inline">
          Revoke<span className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-transparent">AI</span>
        </span>
      </div>

      {/* Context pill (the reference's search bar position) */}
      <div className="glass hidden min-w-0 flex-1 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 md:flex md:max-w-[560px]">
        {secure ? <FileText className="size-4.5 shrink-0 text-zinc-400" /> : <MessageSquare className="size-4.5 shrink-0 text-zinc-400" />}
        <span className="min-w-0 flex-1 truncate text-[14px] text-zinc-300">
          {context ?? (secure ? 'Secure workspace' : 'Assistant · ask anything')}
        </span>
        <span className="rounded-full bg-white/[0.08] px-4 py-2 text-[12.5px] font-medium text-zinc-200">
          {secure ? 'RevokeAI protected' : 'Standard chat'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
        <BackendDot ok={backendOk} />
        <SecurityToggle on={secure} available={secureAvailable} onToggle={onToggleSecure} />
        {user && (
          <div className="glass hidden items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 xl:flex" title={user}>
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-sky-400 via-violet-400 to-fuchsia-400 text-[13px] font-semibold text-zinc-950">
              {user[0]?.toUpperCase()}
            </span>
            <span className="leading-tight">
              <span className="block max-w-[140px] truncate text-[13px] text-zinc-100">{user.split('@')[0]}</span>
              <span className="block text-[11px] text-zinc-500">Signed in</span>
            </span>
          </div>
        )}
      </div>
    </header>
  )
}

function SecurityToggle({ on, available, onToggle }: { on: boolean; available: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      title={available ? undefined : 'Secure mode is not configured on the server'}
      className={`group inline-flex items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-3.5 text-[13.5px] font-medium transition-all duration-300 ${
        on ? 'tile-selected text-white' : 'glass text-zinc-300 hover:text-zinc-100'
      }`}
    >
      <ShieldCheck className={`size-4 transition ${on ? 'text-white' : 'text-zinc-500 group-hover:text-violet-300'}`} />
      <span className="hidden sm:inline">{on ? 'RevokeAI Security On' : 'Enable RevokeAI Security'}</span>
      <span className="sm:hidden">{on ? 'Secure' : 'Secure mode'}</span>
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300 ${on ? 'bg-white/25' : 'bg-zinc-700/80'}`}>
        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-300 ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

function BackendDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return null
  return (
    <span
      title={ok ? 'Gateway connected' : 'Gateway unreachable'}
      className={`hidden items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] md:inline-flex ${
        ok ? 'glass text-zinc-300' : 'border border-red-500/30 bg-red-500/10 text-red-300'
      }`}
    >
      <span className={`size-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {ok ? 'Online' : 'Offline'}
    </span>
  )
}
