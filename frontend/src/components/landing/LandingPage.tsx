import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { useScramble } from '../../hooks/useScramble'
import { DocsSheet } from './DocsSheet'
import type { DocsSection } from './DocsSheet'
import { FiberCanvas } from './FiberCanvas'
import { ProductPreview } from './ProductPreview'

const CONTACT_EMAIL = 'us9250@srmist.edu.in'

const NAV: { label: string; section: DocsSection }[] = [
  { label: 'Architecture', section: 'architecture' },
  { label: 'Security', section: 'security' },
  { label: 'Whitepaper', section: 'whitepaper' },
]

export function LandingPage({ onTryRevokeAI }: { onTryRevokeAI: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [docs, setDocs] = useState<DocsSection | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const stage = useRef(0)
  const fade = useRef(0)
  const productSection = useRef<HTMLElement>(null)
  const productCard = useRef<HTMLDivElement>(null)

  const openDocs = (section: DocsSection) => {
    setMenuOpen(false)
    setDocs(section)
  }
  const tryIt = () => {
    setMenuOpen(false)
    setDocs(null)
    onTryRevokeAI()
  }

  // Scroll drives the fibre formation, the ring fade-out and the product reveal.
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const vh = window.innerHeight
      const y = window.scrollY
      stage.current = y / vh
      setScrolled(y > 24)
      const sec = productSection.current
      const card = productCard.current
      if (sec && card) {
        const { top } = sec.getBoundingClientRect()
        // Ring glows behind the rising product card, then fades out completely as
        // the card scrolls away, so the closing section sits on plain black.
        const cardBottom = card.getBoundingClientRect().bottom
        fade.current = Math.min(Math.max((vh * 0.8 - cardBottom) / (vh * 0.35), 0), 1)
        const q = Math.min(Math.max((vh - top) / (vh * 0.95), 0), 1)
        const e = 1 - (1 - q) ** 3
        card.style.transform = `perspective(1400px) translateY(${(1 - e) * 38}%) rotateX(${(1 - e) * 32}deg) scale(${0.9 + e * 0.1})`
        card.style.opacity = String(0.15 + e * 0.85)
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  return (
    <div className="landing-root relative bg-[#05040a] text-white">
      <FiberCanvas stage={stage} fade={fade} />

      {/* NAVBAR */}
      <nav
        className={`fixed inset-x-0 top-0 z-30 transition-colors duration-500 ${scrolled ? 'bg-[#05040a]/60 backdrop-blur-md' : ''}`}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <a href="#/" className="font-heading flex items-center gap-2 text-[19px] leading-none" aria-label="RevokeAI home">
            <LogoMark />
            <span>
              RevokeAI<sup className="ml-0.5 text-[0.5em] text-white/60">&reg;</sup>
            </span>
          </a>

          <div className="hidden items-center gap-9 md:flex">
            {NAV.map((item) => (
              <button
                key={item.label}
                onClick={() => openDocs(item.section)}
                className="text-[11px] font-semibold tracking-[0.18em] text-white/75 uppercase transition hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            onClick={tryIt}
            className="hidden rounded-full border border-white/10 bg-white/[0.07] px-5 py-2.5 text-[11px] font-semibold tracking-[0.16em] uppercase backdrop-blur transition hover:border-violet-400/40 hover:bg-white/[0.12] md:block"
          >
            Try RevokeAI
          </button>

          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="relative z-40 flex size-10 items-center justify-center md:hidden"
          >
            <span className="relative block h-3.5 w-6">
              <span className={`absolute left-0 block h-[1.5px] w-full bg-white transition-all duration-300 ${menuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-0'}`} />
              <span className={`absolute top-1/2 left-0 block h-[1.5px] w-full -translate-y-1/2 bg-white transition-opacity ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
              <span className={`absolute left-0 block h-[1.5px] w-full bg-white transition-all duration-300 ${menuOpen ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'bottom-0'}`} />
            </span>
          </button>
        </div>
      </nav>

      {/* MOBILE MENU */}
      <div
        className={`fixed inset-0 z-20 flex flex-col justify-center bg-[#05040a]/95 px-6 backdrop-blur-md transition-opacity duration-300 md:hidden ${
          menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!menuOpen}
      >
        <div className="flex flex-col gap-7">
          {NAV.map((item, i) => (
            <button
              key={item.label}
              tabIndex={menuOpen ? 0 : -1}
              onClick={() => openDocs(item.section)}
              className={`font-heading text-left text-[36px] leading-none transition-all duration-500 ${menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              style={{ transitionDelay: menuOpen ? `${80 + i * 60}ms` : '0ms' }}
            >
              {item.label}
            </button>
          ))}
          <button
            tabIndex={menuOpen ? 0 : -1}
            onClick={tryIt}
            className={`mt-4 w-fit rounded-full bg-white px-6 py-3 text-[13px] font-semibold tracking-[0.14em] text-black uppercase transition-all duration-500 ${menuOpen ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDelay: menuOpen ? '260ms' : '0ms' }}
          >
            Try RevokeAI
          </button>
        </div>
      </div>

      <main className="relative z-10">
        {/* 0 · HERO (fibres fan out on the left) */}
        <Section className="items-end pb-16 md:items-center md:pb-0">
          <div className="w-full md:ml-[52%] md:max-w-[560px]">
            <Copy
              eyebrow="Consent Intelligence"
              line1="Next-Generation"
              line2="Consent for AI Agents"
              body="Decide exactly what every AI agent can see, and take it back the moment the task is done. Enforced before the model reads a single word."
              big
              instant
            />
            <div className="mt-9 flex flex-wrap items-center gap-2.5">
              <button onClick={tryIt} className="rounded-full bg-white px-6 py-3 text-[13px] font-semibold tracking-[0.14em] text-black uppercase transition hover:bg-violet-100">
                Try RevokeAI
              </button>
              <button
                onClick={() => openDocs('architecture')}
                className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-[13px] font-semibold tracking-[0.14em] uppercase backdrop-blur transition hover:border-white/30"
              >
                Read Docs
              </button>
              <CopyEmail />
            </div>
          </div>
        </Section>

        {/* 1 · ABOUT (tangle) */}
        <Section className="items-center">
          <div className="w-full md:ml-[33%] md:max-w-[520px]">
            <Copy
              eyebrow="About the Platform"
              line1="One Consent Layer."
              line2="Every Agent Accountable."
              body="RevokeAI sits between your organisation's data and every AI agent that uses it, turning consent into something you grant per scope and withdraw at any moment."
            />
          </div>
        </Section>

        {/* 2 · PROBLEM (fragments converge into a single beam) */}
        <Section className="items-end pb-20 md:pb-28">
          <div className="w-full md:ml-[16%] md:max-w-[520px]">
            <Copy
              eyebrow="The Problem"
              line1="AI Never Forgets."
              line2="That Is the Breach."
              body="Prompts, uploads and retrieved documents persist in context windows, vector stores and logs long after the task ends. One compromised agent exposes everything it was ever shown."
            />
          </div>
        </Section>

        {/* 3 · SOLUTION (crossing X) */}
        <Section className="items-end justify-center pb-16 text-center md:pb-24">
          <div className="mx-auto w-full max-w-[640px]">
            <Copy
              eyebrow="The Solution"
              line1="Consent You Can Revoke."
              line2="Proof You Can Verify."
              body="Each document is split into scoped permissions anchored on the MST blockchain. Revoke a scope and the gateway refuses it before the prompt reaches the model, with a signed receipt as proof."
              center
            />
          </div>
        </Section>

        {/* 4 · PORTAL (ring) */}
        <Section className="items-end justify-center pb-24 text-center">
          <div className="mx-auto w-full max-w-[600px]">
            <Copy eyebrow="The Product" line1="The Consent Gateway," line2="In Action." center />
          </div>
        </Section>

        {/* 5 · PRODUCT REVEAL */}
        <section ref={productSection} className="relative px-4 pb-24 sm:px-8">
          <div ref={productCard} className="mx-auto max-w-[1100px] origin-top will-change-transform" style={{ opacity: 0.15 }}>
            <ProductPreview />
          </div>
        </section>

        {/* 6 · CLOSING CTA + FOOTER */}
        <section className="relative px-5 pt-16 pb-10 sm:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="max-w-[720px]">
              <Copy
                eyebrow="Get Started"
                line1="Take Back What"
                line2="Your Agents Know."
                body="No wallet, no gas fees, nothing to install. Upload a document, choose what the agent may see, and revoke it with one click."
              />
              <div className="mt-9 flex flex-wrap gap-2.5">
                <button onClick={tryIt} className="rounded-full bg-white px-6 py-3 text-[13px] font-semibold tracking-[0.14em] text-black uppercase transition hover:bg-violet-100">
                  Try RevokeAI
                </button>
                <CopyEmail />
              </div>
            </div>
            <div className="mt-24 flex flex-col gap-4 border-t border-white/10 pt-6 text-[12px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-heading flex items-center gap-2 text-[15px] text-white/80">
                <LogoMark /> RevokeAI&reg;
              </span>
              <span>Consent-gated memory for AI agents. Built for the MST Blockchain Buildathon.</span>
              <span>&copy; 2026 RevokeAI</span>
            </div>
          </div>
        </section>
      </main>

      {docs && <DocsSheet section={docs} onClose={() => setDocs(null)} onTry={tryIt} />}
    </div>
  )
}

function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`relative flex min-h-dvh px-5 sm:px-8 ${className}`}>
      <div className="mx-auto flex w-full max-w-[1400px]">{children}</div>
    </section>
  )
}

/** Eyebrow + two-line headline (second line decodes) + body, revealed on scroll. */
function Copy({
  eyebrow,
  line1,
  line2,
  body,
  big,
  center,
  instant,
}: {
  eyebrow: string
  line1: string
  line2: string
  body?: string
  big?: boolean
  center?: boolean
  instant?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (instant) {
      const t = window.setTimeout(() => setSeen(true), 350)
      return () => window.clearTimeout(t)
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [instant])

  const scramble = useScramble(line2, seen, 1000)
  const reveal = `transition-all duration-700 ${seen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`

  return (
    <div ref={ref} className="[text-shadow:0_2px_30px_rgba(5,4,10,0.9)]">
      <p className={`flex items-center gap-2.5 text-[10.5px] font-semibold tracking-[0.2em] text-white/60 uppercase ${center ? 'justify-center' : ''} ${reveal}`}>
        <span className="inline-block size-2.5 rounded-full border border-violet-300/70" />
        {eyebrow}
      </p>
      <h2
        className={`font-heading mt-5 leading-[1.06] tracking-[-0.01em] ${big ? 'text-[40px] sm:text-[58px]' : 'text-[34px] sm:text-[48px]'}`}
        aria-label={`${line1} ${line2}`}
      >
        <span aria-hidden="true" className={`block ${reveal}`}>
          {line1}
        </span>
        <span aria-hidden="true" className="block">
          <span className={scramble.hidden ? 'opacity-0' : ''}>{scramble.hidden ? line2 : scramble.head}</span>
          {scramble.tail && <span className="text-white/70 blur-[2px]">{scramble.tail}</span>}
        </span>
      </h2>
      {body && (
        <p
          className={`mt-6 text-[15.5px] leading-relaxed text-white/60 ${center ? 'mx-auto' : ''} max-w-[480px] ${reveal}`}
          style={{ transitionDelay: seen ? '250ms' : '0ms' }}
        >
          {body}
        </p>
      )}
    </div>
  )
}

function CopyEmail() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 2000)
  }
  return (
    <button
      onClick={copy}
      aria-live="polite"
      className="rounded-full px-4 py-3 text-[13px] text-white/60 underline decoration-white/25 underline-offset-4 transition hover:text-white"
    >
      {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? CONTACT_EMAIL : `Contact: ${CONTACT_EMAIL}`}
    </button>
  )
}

function LogoMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="rv-mark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <path d="M3 7h13M3 12h18M3 17h10" stroke="url(#rv-mark)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}
