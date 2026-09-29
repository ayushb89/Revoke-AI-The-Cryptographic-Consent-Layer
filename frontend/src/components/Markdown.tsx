import type { ReactNode } from 'react'

/**
 * Minimal, injection-safe Markdown for model replies: paragraphs, bullet and
 * numbered lists, **bold**, *italic* and `code`. Everything renders as React
 * text nodes — no HTML from the model ever reaches the DOM.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{items}</ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-1 pl-5 marker:text-zinc-500">{items}</ul>
      ),
    )
    list = null
  }

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flushPara()
      const ordered = Boolean(numbered)
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)![1])
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.replace(/^#{1,6}\s+/, ''))
    }
  }
  flushPara()
  flushList()

  return <div className="space-y-2.5 leading-relaxed">{blocks}</div>
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={m.index} className="font-semibold text-white">{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`'))
      out.push(<code key={m.index} className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.85em] text-emerald-300">{tok.slice(1, -1)}</code>)
    else out.push(<em key={m.index}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
