import { FileText, Fingerprint, LoaderCircle, ScanText, ShieldCheck, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useEffect } from 'react'

import { sensitivityOf, shortHex } from '../config'
import type { ActiveSession } from '../hooks/useRevokeAI'
import type { Ingestion } from '../lib/api'
import { SensitivityTag } from './SensitivityTag'

const SOURCE_NAMES: Record<Ingestion['sourceType'], string> = {
  text: 'Text',
  pdf: 'PDF',
  docx: 'Word',
  png: 'Image',
  jpeg: 'Image',
}

function IngestionSummary({ ingestion }: { ingestion: Ingestion }) {
  const semantic = ingestion.chunking === 'semantic'
  const pill = 'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]'
  return (
    <div className="mb-1 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${pill} border-white/10 bg-zinc-950/60 text-zinc-300`}>
          <FileText className="size-3" />
          {SOURCE_NAMES[ingestion.sourceType]}
          {ingestion.pages ? ` · ${ingestion.pages} page${ingestion.pages > 1 ? 's' : ''}` : ''} · {ingestion.textChars.toLocaleString()} chars
        </span>
        {ingestion.extraction === 'ocr' && (
          <span className={`${pill} border-sky-500/25 bg-sky-500/10 text-sky-300`}>
            <ScanText className="size-3" /> Text read with Gemini Vision
          </span>
        )}
        <span
          className={`${pill} ${semantic ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-zinc-600/40 bg-zinc-800/60 text-zinc-300'}`}
        >
          <Sparkles className="size-3" />
          {semantic ? `AI semantic chunking${ingestion.model ? ` · ${ingestion.model}` : ''}` : 'Rule-based chunking'}
        </span>
      </div>
      {ingestion.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          <TriangleAlert className="mt-px size-3 shrink-0" /> {w}
        </p>
      ))}
    </div>
  )
}

interface Props {
  session: ActiveSession
  onSecure: () => void
  onCancel: () => void
}

export function ScopeReviewModal({ session, onSecure, onCancel }: Props) {
  const busy = session.stage === 'registering'

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [busy, onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="scope-review-title">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={() => !busy && onCancel()} />
      <div className="relative flex max-h-[92dvh] w-full max-w-2xl animate-slide-up flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0d0d16]/95 shadow-2xl shadow-violet-950/40 backdrop-blur-xl sm:rounded-[28px]">
        <div className="flex items-start gap-3 border-b border-white/5 p-5">
          <div className="grid size-10 shrink-0 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10">
            <FileText className="size-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="scope-review-title" className="text-base font-semibold">Review what the agent will see</h2>
            <p className="mt-0.5 truncate text-sm text-zinc-400">
              <span className="font-mono text-zinc-300">{session.filename}</span> was split into {session.scopes.length} data scopes
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300 disabled:opacity-30"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-2.5 overflow-y-auto p-5">
          {session.ingestion && <IngestionSummary ingestion={session.ingestion} />}
          {session.scopes.map((s, i) => (
            <div key={s.scopeHash} className="animate-slide-up rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3.5" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-zinc-100">{s.label}</span>
                <SensitivityTag kind={sensitivityOf(s.label)} />
                <span className="ml-auto font-mono text-[11px] text-zinc-500">{s.chars} chars</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">{s.preview}</p>
              <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
                <Fingerprint className="size-3" /> {shortHex(s.scopeHash, 10, 8)}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-white/5 bg-zinc-950/40 p-5">
          <p className="flex gap-2 text-xs leading-relaxed text-zinc-400">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            RevokeAI records a tamper-proof consent entry for each scope on the MST ledger on your behalf. Only salted
            fingerprints and labels are recorded; your document never leaves the gateway's memory. No wallet or fees needed.
          </p>

          {session.registerError && (
            <p className="flex animate-shake items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <TriangleAlert className="size-3.5 shrink-0" /> {session.registerError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              onClick={onCancel}
              disabled={busy}
              className="rounded-full px-4 py-2.5 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30"
            >
              Discard
            </button>
            <button
              onClick={onSecure}
              disabled={busy}
              className="relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-medium text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:cursor-wait disabled:bg-emerald-500/80"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {busy ? 'Securing on-chain…' : `Secure ${session.scopes.length} scopes & start`}
              {busy && <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-scan bg-gradient-to-r from-transparent via-white/30 to-transparent" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
