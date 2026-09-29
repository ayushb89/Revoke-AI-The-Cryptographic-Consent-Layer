import { useEffect, useState } from 'react'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * "Decoding" text: once `active`, characters resolve left to right while the
 * unresolved tail cycles through random glyphs. Returns the resolved prefix and
 * the scrambled tail separately so the tail can be styled (blurred).
 */
export function useScramble(text: string, active: boolean, duration = 900) {
  const reduced = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [resolved, setResolved] = useState(reduced ? text.length : 0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!active || reduced) return
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      setResolved(Math.floor(p * text.length))
      setTick((x) => x + 1)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, reduced, text, duration])

  const done = resolved >= text.length
  let tail = ''
  if (!done && active) {
    for (let i = resolved; i < text.length; i++) {
      const c = text[i]
      tail += c === ' ' ? ' ' : GLYPHS[(i * 7 + tick * 13) % GLYPHS.length]
    }
  }
  return { head: active || done ? text.slice(0, resolved) : '', tail, done, hidden: !active && !done }
}
