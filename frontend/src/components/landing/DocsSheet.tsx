import { useEffect } from 'react'

export type DocsSection = 'architecture' | 'security' | 'whitepaper'

const SECTIONS: { id: DocsSection; title: string; body: { heading: string; text: string }[] }[] = [
  {
    id: 'architecture',
    title: 'Architecture',
    body: [
      {
        heading: '1. Scope',
        text: 'A document is extracted and divided by AI into discrete data scopes such as identity, lab results or billing. Each scope is fingerprinted with a salted hash that reveals nothing about its contents.',
      },
      {
        heading: '2. Anchor',
        text: 'The RevokeAI gateway records one consent entry per scope on the MST blockchain through a gasless relayer. Users need no wallet and pay no fees.',
      },
      {
        heading: '3. Gate',
        text: 'Before any prompt reaches the model, the gateway reads consent for every scope at a single block. Only consented, relevant scopes are passed to the agent.',
      },
      {
        heading: '4. Revoke',
        text: 'Revoking a scope writes a permanent on-chain record. From that block onward the gateway refuses the data, deletes it from working memory and scrubs earlier answers derived from it.',
      },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    body: [
      { heading: 'Nothing sensitive on-chain', text: 'Only salted fingerprints and generic category labels are recorded. Raw documents never leave the gateway, and are held in memory only.' },
      { heading: 'Fail closed', text: 'If consent cannot be verified, the request is blocked. No data is released on the assumption that access is still permitted.' },
      { heading: 'Verifiable refusals', text: 'Every blocked request returns an EIP-712 signed receipt bound to the chain, the registry contract and the block at which consent was read.' },
      { heading: 'Irreversible revocation', text: 'A revoked scope can never be silently re-enabled. Restoring access requires a new, explicitly consented session.' },
    ],
  },
  {
    id: 'whitepaper',
    title: 'Protocol overview',
    body: [
      {
        heading: 'Abstract',
        text: 'AI agents retain what they are given. RevokeAI separates the right to use data from the data itself: consent becomes an addressable, time-stamped object that an organisation can grant per scope and withdraw at any moment, with the withdrawal enforced at the only point that matters, before the model sees the prompt.',
      },
      {
        heading: 'Consent registry',
        text: 'A Solidity registry stores sessions and per-scope consent flags. Reads are batched and pinned to one block so a prompt is always judged against a single, consistent state.',
      },
      {
        heading: 'Memory hygiene',
        text: 'Revocation propagates to the agent layer: context is filtered, derived answers are redacted from conversation history, and purged content is removed from gateway memory.',
      },
    ],
  },
]

export function DocsSheet({ section, onClose, onTry }: { section: DocsSection; onClose: () => void; onTry: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    document.getElementById(`docs-${section}`)?.scrollIntoView({ block: 'start' })
    return () => document.removeEventListener('keydown', esc)
  }, [section, onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="RevokeAI documentation">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl animate-slide-up flex-col border-l border-white/10 bg-[#0b0a12] text-white shadow-2xl shadow-violet-950/40">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <p className="font-heading text-[22px]">RevokeAI&reg; Docs</p>
          <button onClick={onClose} className="text-[13px] font-semibold tracking-[0.16em] text-white/70 uppercase hover:text-white">
            Close
          </button>
        </div>
        <div className="scroll-thin flex-1 space-y-12 overflow-y-auto px-6 py-8">
          {SECTIONS.map((s) => (
            <section key={s.id} id={`docs-${s.id}`} className="scroll-mt-6">
              <h2 className="font-heading text-[28px] leading-tight">{s.title}</h2>
              <div className="mt-5 space-y-5">
                {s.body.map((b) => (
                  <div key={b.heading}>
                    <h3 className="text-[16px] text-white">{b.heading}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-white/60">{b.text}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="border-t border-white/10 px-6 py-5">
          <button onClick={onTry} className="rounded-full bg-white px-6 py-3 text-[13px] font-semibold tracking-[0.14em] text-black uppercase transition hover:bg-violet-100">
            Try RevokeAI
          </button>
        </div>
      </div>
    </div>
  )
}
