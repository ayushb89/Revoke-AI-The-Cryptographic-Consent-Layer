import { FileText, FlaskConical, LoaderCircle, Lock, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { ACCEPTED_FILES } from '../config'
import { sampleFile } from '../samples/medicalRecord'
import { Orb } from './Orb'

interface Props {
  uploading: boolean
  onFile: (file: File) => void
}

export function UploadPanel({ uploading, onFile }: Props) {
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl animate-slide-up flex-col items-center px-2 py-8 text-center sm:py-10">
      <Orb size={88} tone="emerald" />
      <h1 className="mt-8 text-[28px] leading-tight font-semibold tracking-tight text-balance sm:text-[34px]">
        Give your agent a document.
        <br />
        <span className="bg-gradient-to-r from-emerald-200 via-sky-200 to-violet-200 bg-clip-text text-transparent">Take it back anytime.</span>
      </h1>
      <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-pretty text-zinc-400">
        RevokeAI splits your record into data scopes and records your consent on a tamper-proof ledger. Revoke any scope
        and the agent is cut off instantly. No wallet, no fees, nothing to install.
      </p>

      {/* Drop card, styled like the reference composer */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`glass relative mt-8 w-full overflow-hidden rounded-[28px] p-1.5 transition-all duration-300 ${
          dragging ? 'scale-[1.01] border-emerald-300/50 shadow-[0_0_60px_-15px] shadow-emerald-400/50' : ''
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-2 pb-2.5 text-[12px] text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-violet-300" /> AI splits it into scopes you control
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-300" /> RevokeAI Security is on
          </span>
        </div>
        <div
          className={`relative rounded-[22px] border border-dashed px-6 py-9 transition ${
            dragging ? 'border-emerald-300/60 bg-emerald-400/[0.07]' : 'border-white/10 bg-black/25'
          }`}
        >
          {uploading && (
            <div className="absolute inset-x-6 top-0 h-0.5 overflow-hidden rounded-full bg-emerald-500/10">
              <div className="h-full w-1/3 animate-scan bg-emerald-300" />
            </div>
          )}
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/[0.07]">
            {uploading ? <LoaderCircle className="size-5 animate-spin text-emerald-300" /> : <UploadCloud className="size-5 text-zinc-200" />}
          </div>
          <p className="mt-4 text-[15px] font-medium text-zinc-100">
            {uploading ? 'Reading your document and splitting it into data scopes…' : 'Drop a document here'}
          </p>
          <p className="mt-1 text-[12.5px] text-zinc-500">PDF, Word, images or text · up to 10 MB · held in memory only, never stored on disk</p>

          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <button
              disabled={uploading}
              onClick={() => onFile(sampleFile())}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-medium text-zinc-900 shadow-lg shadow-white/10 transition hover:bg-violet-50 disabled:opacity-50"
            >
              <FlaskConical className="size-4" /> Load sample lab report
            </button>
            <button
              disabled={uploading}
              onClick={() => input.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-[13.5px] font-medium text-zinc-200 transition hover:bg-white/[0.1] disabled:opacity-50"
            >
              <FileText className="size-4" /> Browse files
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_FILES}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[
          { icon: <FileText className="size-5" />, t: 'Scope', d: 'AI splits your document into labelled data scopes.', tint: 'text-sky-300' },
          { icon: <ShieldCheck className="size-5" />, t: 'Secure', d: 'Consent for each scope is recorded on MST.', tint: 'text-emerald-300' },
          { icon: <Lock className="size-5" />, t: 'Revoke', d: 'One click cuts the agent off, with proof.', tint: 'text-fuchsia-300' },
        ].map((s) => (
          <div key={s.t} className="glass flex items-start gap-3 rounded-3xl p-4 text-left">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.07] ${s.tint}`}>{s.icon}</span>
            <span>
              <span className="block text-[14.5px] font-medium text-zinc-100">{s.t}</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-zinc-500">{s.d}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
