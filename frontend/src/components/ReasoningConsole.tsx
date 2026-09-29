import { ChevronDown, Cpu } from 'lucide-react'
import { useId, useState } from 'react'

export interface LogLine {
  /** Who produced the line: the deterministic gateway, or the model's own account. */
  source: 'gateway' | 'gatekeeper' | 'model'
  text: string
}

const SOURCE_STYLE: Record<LogLine['source'], string> = {
  gateway: 'text-emerald-300',
  gatekeeper: 'text-red-300',
  model: 'text-violet-300',
}

/**
 * "AI Reasoning" toggle + collapsible developer-console panel shown under an
 * agent message or blocked card.
 */
export function ReasoningConsole({ lines, tone = 'default' }: { lines: LogLine[]; tone?: 'default' | 'danger' }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  if (lines.length === 0) return null

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] transition ${
          open ? 'bg-white/[0.07] text-zinc-200' : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200'
        }`}
      >
        <Cpu className="size-3.5" />
        AI reasoning
        <ChevronDown className={`size-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* grid-rows 0fr→1fr gives a smooth height transition without measuring */}
      <div
        id={panelId}
        role="region"
        aria-label="AI reasoning log"
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div
            className={`mt-2 overflow-hidden rounded-2xl border bg-[#05050a]/85 font-mono text-[12.5px] leading-relaxed shadow-inner shadow-black/60 ${
              tone === 'danger' ? 'border-red-400/20' : 'border-white/[0.08]'
            }`}
          >
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3.5 py-2 text-[10.5px] tracking-wide text-zinc-500">
              <span className="flex gap-1" aria-hidden="true">
                <span className="size-2 rounded-full bg-red-400/70" />
                <span className="size-2 rounded-full bg-amber-300/70" />
                <span className="size-2 rounded-full bg-emerald-400/70" />
              </span>
              <span className="ml-1">revokeai · reasoning.log</span>
            </div>
            <ol className="space-y-1.5 px-3.5 py-3">
              {lines.map((line, i) => (
                <li key={i} className="flex gap-2.5 text-zinc-300">
                  <span className="shrink-0 text-zinc-600 select-none">{String(i + 1).padStart(2, '0')}</span>
                  <span className={`w-[5.5rem] shrink-0 ${SOURCE_STYLE[line.source]}`}>[{line.source}]</span>
                  <span className="min-w-0 break-words whitespace-pre-wrap">{line.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
