import { ArrowUp, CheckCircle2, EyeOff, FileText, Layers, Link2, ShieldCheck, Sparkles, TriangleAlert, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { Message } from '../hooks/messages'
import type { ActiveSession } from '../hooks/useRevokeAI'
import type { RevokeAIInfo } from '../lib/api'
import { SUGGESTED_PROMPTS } from '../samples/medicalRecord'
import { BlockedCard } from './BlockedCard'
import { Markdown } from './Markdown'
import { ReasoningConsole } from './ReasoningConsole'
import type { LogLine } from './ReasoningConsole'
import { shortHex } from '../config'
import type { BlockedResponse } from '../lib/api'

interface Props {
  secure: boolean
  session: ActiveSession | null
  messages: Message[]
  thinking: boolean
  chain?: RevokeAIInfo
  onSend: (text: string) => void
  onOpenScopes: () => void
  emptyState: ReactNode
}

export function ChatPanel({ secure, session, messages, thinking, chain, onSend, onOpenScopes, emptyState }: Props) {
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const active = secure && session?.stage === 'active'
  const showEmpty = messages.length === 0 && (!secure || !active)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, thinking])

  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  const submit = (text = draft) => {
    if (!text.trim() || thinking) return
    onSend(text)
    setDraft('')
  }

  return (
    <section className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px]">
      {active && session && (
        <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-3">
          <span className="grid size-7 place-items-center rounded-full bg-emerald-400/15">
            <FileText className="size-3.5 text-emerald-300" />
          </span>
          <span className="truncate text-[13.5px] text-zinc-200">{session.filename}</span>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11.5px] text-zinc-400">
            {session.scopes.filter((s) => s.state === 'active').length}/{session.scopes.length} scopes active
          </span>
          <button
            onClick={onOpenScopes}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300 transition hover:bg-white/[0.08] lg:hidden"
          >
            <Layers className="size-3.5" /> Scopes
          </button>
        </div>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-8">
        {showEmpty ? (
          emptyState
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((m) => (
              <MessageView key={m.id} m={m} chain={chain} />
            ))}
            {thinking && <Thinking gated={active} />}
            {active && messages.length <= 1 && !thinking && (
              <div className="animate-fade-in pt-2">
                <p className="mb-3 text-[12.5px] text-zinc-500">Try asking the agent</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => submit(p)}
                      className="glass rounded-full px-4 py-2 text-[12.5px] text-zinc-300 transition hover:border-violet-300/40 hover:text-white"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>

      {/* Composer card */}
      <div className="px-3 pt-1 pb-3 sm:px-6 sm:pb-5">
        <div className="glass-strong mx-auto max-w-3xl rounded-[26px] p-1.5 transition focus-within:border-violet-300/40 focus-within:shadow-[0_0_50px_-18px] focus-within:shadow-violet-400/60">
          <div className="flex items-center justify-between gap-3 px-3.5 pt-1.5 pb-2 text-[11.5px] text-zinc-400">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
              {active ? (
                <>
                  <ShieldCheck className="size-3.5 shrink-0 text-emerald-300" /> Consent is checked before anything reaches the model
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5 shrink-0 text-violet-300" /> Enter to send · Shift+Enter for a new line
                </>
              )}
            </span>
            <span className="hidden shrink-0 items-center gap-1.5 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-gradient-to-r from-sky-300 to-violet-300" /> Powered by Gemini
            </span>
          </div>
          <div className="flex items-end gap-2 rounded-[20px] bg-black/30 p-2 pl-4">
            <textarea
              ref={textarea}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={active ? 'Ask the agent about your document…' : secure ? 'Upload a record above, or just chat…' : 'Message the assistant…'}
              aria-label="Message"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              onClick={() => submit()}
              disabled={!draft.trim() || thinking}
              aria-label="Send"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-zinc-900 shadow-lg shadow-white/10 transition hover:bg-violet-100 disabled:bg-white/10 disabled:text-zinc-500 disabled:shadow-none"
            >
              <ArrowUp className="size-4.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function MessageView({ m, chain }: { m: Message; chain?: RevokeAIInfo }) {
  switch (m.kind) {
    case 'user':
      return (
        <div className="flex animate-slide-up justify-end gap-3">
          <div className="max-w-[85%] rounded-3xl rounded-tr-lg border border-violet-300/15 bg-gradient-to-br from-violet-500/25 via-indigo-500/15 to-sky-500/15 px-4 py-2.5 text-[14.5px] whitespace-pre-wrap text-white">
            {m.text}
          </div>
          <Avatar kind="user" />
        </div>
      )
    case 'agent':
      return (
        <div className="flex animate-slide-up gap-3">
          <Avatar kind="agent" />
          <div className="min-w-0 max-w-[85%] flex-1">
            {m.redactedBecause?.length ? (
              <div className="animate-fade-in rounded-3xl rounded-tl-lg border border-dashed border-red-400/30 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200/80">
                <p className="flex items-center gap-2 font-medium">
                  <EyeOff className="size-4" /> Scrubbed from agent memory
                </p>
                <p className="mt-1 text-xs text-red-200/60">
                  This answer used {m.redactedBecause.join(', ')}, which you revoked on-chain. It has been removed from the
                  conversation the agent can see.
                </p>
              </div>
            ) : (
              <div className="rounded-3xl rounded-tl-lg border border-white/[0.07] bg-white/[0.045] px-4 py-3 text-[14.5px] text-zinc-200">
                <Markdown text={m.text} />
              </div>
            )}
            {(m.scopesUsed.length > 0 || m.withheld.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                {m.scopesUsed.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-0.5 text-emerald-300/90">
                    <CheckCircle2 className="size-3" /> {l}
                  </span>
                ))}
                {m.withheld.map((w) => (
                  <span key={w.label} className="inline-flex items-center gap-1 rounded-full border border-red-400/20 bg-red-500/[0.06] px-2 py-0.5 text-red-300/80 line-through decoration-red-400/50">
                    {w.label}
                  </span>
                ))}
                {m.blockNumber !== undefined && <span className="font-mono text-zinc-600">· consent read @ block {m.blockNumber}</span>}
              </div>
            )}
            <ReasoningConsole lines={agentLog(m)} />
          </div>
        </div>
      )
    case 'blocked':
      return (
        <div className="flex gap-3">
          <Avatar kind="agent" />
          <div className="min-w-0 flex-1">
            <BlockedCard data={m.data} info={chain} />
            <ReasoningConsole lines={blockedLog(m.data)} tone="danger" />
          </div>
        </div>
      )
    case 'system':
      return (
        <div className="flex animate-fade-in justify-center">
          <div
            className={`inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border px-4 py-1.5 text-xs backdrop-blur ${
              m.tone === 'success' ? 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200' : 'border-red-400/25 bg-red-500/[0.07] text-red-200'
            }`}
          >
            <Link2 className="size-3.5 shrink-0" />
            <span>{m.text}</span>
            {m.explorerUrl && (
              <a href={m.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 hover:text-white">
                View proof
              </a>
            )}
          </div>
        </div>
      )
    case 'error':
      return (
        <div className="flex animate-fade-in justify-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
            <TriangleAlert className="size-3.5 shrink-0" /> {m.text}
          </p>
        </div>
      )
  }
}

function Avatar({ kind }: { kind: 'user' | 'agent' }) {
  return kind === 'user' ? (
    <div className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06]">
      <User className="size-4 text-zinc-300" />
    </div>
  ) : (
    <div className="relative size-9 shrink-0" aria-hidden="true">
      <div className="orb-core absolute inset-0 rounded-full opacity-90" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,0.8),transparent_45%)]" />
      <div className="absolute inset-0 rounded-full shadow-[inset_-4px_-5px_9px_rgba(7,7,13,0.65)]" />
    </div>
  )
}

function Thinking({ gated }: { gated: boolean }) {
  return (
    <div className="flex animate-fade-in gap-3">
      <Avatar kind="agent" />
      <div className="flex items-center gap-3 rounded-3xl rounded-tl-lg border border-white/[0.07] bg-white/[0.045] px-4 py-3">
        <span className="flex gap-1">
          {[0, 150, 300].map((d) => (
            <span key={d} className="size-1.5 animate-bounce rounded-full bg-gradient-to-r from-sky-300 to-violet-300" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
        <span className="text-xs text-zinc-400">{gated ? 'Checking consent, then asking the agent…' : 'Thinking…'}</span>
      </div>
    </div>
  )
}

type AgentMessage = Extract<Message, { kind: 'agent' }>

const reasonText = (r: string) => r.replace(/_/g, ' ')

/** Gateway facts (authoritative) followed by the model's self-reported reasoning. */
function agentLog(m: AgentMessage): LogLine[] {
  const lines: LogLine[] = []
  if (m.gated) {
    if (m.blockNumber !== undefined) lines.push({ source: 'gateway', text: `consent verified on-chain at block ${m.blockNumber}` })
    lines.push({
      source: 'gateway',
      text: `scopes sent to model: ${m.scopesUsed.length ? m.scopesUsed.map((l) => `[${l}]`).join(', ') : 'none'}`,
    })
    if (m.withheld.length) {
      lines.push({ source: 'gateway', text: `scopes withheld: ${m.withheld.map((w) => `[${w.label}] (${reasonText(w.reason)})`).join(', ')}` })
    }
  } else {
    lines.push({ source: 'gateway', text: 'standard chat: no document scopes attached; gatekeeper not engaged' })
  }
  lines.push({ source: 'model', text: m.reasoning ?? 'no reasoning returned by the model for this reply' })
  if (m.redactedBecause?.length) {
    lines.push({ source: 'gateway', text: `answer removed from agent-visible history after revocation of ${m.redactedBecause.map((l) => `[${l}]`).join(', ')}` })
  }
  return lines
}

function blockedLog(d: BlockedResponse): LogLine[] {
  const lines: LogLine[] = [{ source: 'gatekeeper', text: d.reasoning ?? d.message }]
  lines.push({ source: 'gatekeeper', text: `denied scopes: ${d.deniedScopes.map((s) => `[${s.label}] (${reasonText(s.reason)})`).join(', ')}` })
  lines.push({
    source: 'gatekeeper',
    text: `registry ${shortHex(d.registry)} · chain ${d.chainId} · block ${d.blockNumber}${d.receipt ? ' · EIP-712 receipt issued' : ''}`,
  })
  return lines
}
