import { BookOpenText, Brain, Lightbulb, PenLine, Scale, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

import { Orb } from './Orb'

const TILES: { label: string; prompt: string; icon: ReactNode; tint: string }[] = [
  { label: 'Explain', prompt: 'Explain how AI agents use long-term memory', icon: <Brain />, tint: 'text-sky-300' },
  { label: 'Write', prompt: 'Draft a short, polite follow-up email to a client', icon: <PenLine />, tint: 'text-fuchsia-300' },
  { label: 'Compliance', prompt: 'What does HIPAA require for patient data?', icon: <Scale />, tint: 'text-amber-300' },
  { label: 'Summarise', prompt: 'Summarise the main privacy risks of sharing documents with AI assistants', icon: <BookOpenText />, tint: 'text-emerald-300' },
  { label: 'Brainstorm', prompt: 'Give me five ideas to reduce sensitive data exposure in my team’s AI workflows', icon: <Lightbulb />, tint: 'text-violet-300' },
]

export function PlainWelcome({ onPrompt, onEnableSecure }: { onPrompt: (p: string) => void; onEnableSecure: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl animate-slide-up flex-col items-center px-2 py-8 text-center sm:py-12">
      <Orb size={104} />
      <h1 className="mt-9 text-[28px] leading-tight font-semibold tracking-tight text-balance sm:text-[34px]">
        Welcome to RevokeAI
        <br />
        <span className="bg-gradient-to-r from-sky-200 via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
          Your consent-aware AI assistant
        </span>
      </h1>
      <p className="mt-3 text-[14.5px] text-zinc-400">Ask anything, or secure a document and stay in control of what the agent sees.</p>

      <div className="mt-9 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <button
          onClick={onEnableSecure}
          className="tile-selected group flex flex-col items-center gap-3 rounded-3xl px-3 py-5 transition hover:brightness-110"
        >
          <span className="grid size-10 place-items-center rounded-full bg-white/20 text-white [&>svg]:size-5">
            <ShieldCheck />
          </span>
          <span className="text-[14.5px] font-medium text-white">Secure a document</span>
        </button>
        {TILES.map((t) => (
          <button
            key={t.label}
            onClick={() => onPrompt(t.prompt)}
            title={t.prompt}
            className="glass group flex flex-col items-center gap-3 rounded-3xl px-3 py-5 transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.07]"
          >
            <span className={`grid size-10 place-items-center rounded-full bg-white/[0.07] [&>svg]:size-5 ${t.tint}`}>{t.icon}</span>
            <span className="text-[14.5px] text-zinc-200">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
