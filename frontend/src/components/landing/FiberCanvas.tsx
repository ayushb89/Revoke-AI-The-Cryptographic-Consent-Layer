import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Procedural "light fibre" background. Every strand is a cubic Bezier whose
 * control points come from one of several formations; `stage` (a float driven
 * by scroll) blends between neighbouring formations, so the fibres re-form as
 * the page scrolls. Drawn with additive blending for the glow.
 *
 * Formations: 0 fan (hero) · 1 tangle (about) · 2 converge-to-beam (problem)
 *             3 crossing X (solution) · 4 ring portal (product)
 */

type Pts = [number, number, number, number, number, number, number, number]

interface Seed {
  u: number // -1..1 position within the bundle
  r1: number
  r2: number
  r3: number
  phase: number
  hue: number
  alpha: number
}

const STRANDS = 150
const FORMATIONS = 5

function seeds(): Seed[] {
  let s = 1337
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: STRANDS }, (_, i) => ({
    u: (i / (STRANDS - 1)) * 2 - 1,
    r1: rand(),
    r2: rand(),
    r3: rand(),
    phase: rand() * Math.PI * 2,
    hue: rand(),
    alpha: 0.35 + rand() * 0.5,
  }))
}

function formation(k: number, s: Seed, i: number, w: number, h: number, t: number): Pts {
  const wob = (amp: number, speed = 0.35) => Math.sin(t * speed + s.phase) * amp
  const mobile = w < 768
  switch (k) {
    case 0: {
      // Fan from a point on the left edge, spraying up and down (text sits on the right).
      const cy = h * (mobile ? 0.34 : 0.55)
      const spread = s.u * Math.abs(s.u) ** 0.3
      return [
        -w * 0.02, cy,
        w * 0.18, cy + wob(4),
        w * (0.32 + s.r1 * 0.08), cy + spread * h * 0.32 + wob(12),
        w * (mobile ? 0.95 : 0.5) + s.r2 * w * 0.08, cy + spread * h * 0.95 + wob(20),
      ]
    }
    case 1: {
      // Loose tangle sweeping across the left, plus a bundle rising to the right.
      if (s.u < 0.35) {
        return [
          -w * 0.05, h * s.r1,
          w * (0.1 + s.r2 * 0.2), h * (s.r3 * 1.2 - 0.1) + wob(40, 0.25),
          w * (0.2 + s.r1 * 0.2), h * (1.1 - s.r2 * 1.2) + wob(40, 0.25),
          w * (0.42 + s.r3 * 0.05), h * s.r2,
        ]
      }
      // Kept right of the copy column (which sits at ~33-69% on desktop).
      return [
        w * (0.6 + s.r1 * 0.08), h * 1.05,
        w * 0.7, h * (0.75 + s.r2 * 0.1),
        w * (0.74 + s.r3 * 0.04), h * (0.55 + wob(0.03)),
        w * (0.82 + s.r1 * 0.12), h * (0.08 + s.r2 * 0.15),
      ]
    }
    case 2: {
      // Fragmented on the left, converging to a single point, leaving as a clean beam.
      const px = w * 0.28
      const py = h * 0.45
      return [
        w * s.r1 * 0.25, h * s.r2,
        w * (0.05 + s.r3 * 0.2) + wob(30, 0.3), h * (s.r1 * 1.1 - 0.05),
        px, py + s.u * 6,
        w * 1.03, py + s.u * h * 0.14 + wob(6),
      ]
    }
    case 3: {
      // Two bundles crossing into an hourglass X at the centre.
      const cx = w * 0.5
      const cy = h * 0.5
      const pinch = s.u * h * 0.05
      return [
        -w * 0.03, cy + s.u * h * 0.52 + wob(10),
        cx - w * 0.14, cy + pinch,
        cx + w * 0.14, cy - pinch,
        w * 1.03, cy - s.u * h * 0.52 - wob(10),
      ]
    }
    default: {
      // Ring portal: short radial fibres around a circle, slowly rotating.
      const cx = w * 0.5
      const cy = h * 0.42
      const R = Math.min(w, h) * 0.11
      const a = (i / STRANDS) * Math.PI * 2 + t * 0.08
      const len = R * (0.35 + s.r1 * 0.55)
      const swirl = 0.35
      const cos = Math.cos
      const sin = Math.sin
      return [
        cx + cos(a) * R, cy + sin(a) * R * 0.55,
        cx + cos(a + swirl * 0.3) * (R + len * 0.3), cy + sin(a + swirl * 0.3) * (R + len * 0.3) * 0.55,
        cx + cos(a + swirl * 0.7) * (R + len * 0.7), cy + sin(a + swirl * 0.7) * (R + len * 0.7) * 0.55,
        cx + cos(a + swirl) * (R + len), cy + sin(a + swirl) * (R + len) * 0.55,
      ]
    }
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x)

// Violet for most formations, electric blue for the ring.
const HUE = [262, 268, 258, 270, 222]

export function FiberCanvas({ stage, fade }: { stage: RefObject<number>; fade: RefObject<number> }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const all = seeds()
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let w = 0
    let h = 0
    let raf = 0
    let shown = 0 // eased stage

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = window.innerWidth
      h = window.innerHeight
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      el.style.width = `${w}px`
      el.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (now: number) => {
      const t = reduced ? 0 : now / 1000
      const target = Math.min(Math.max(stage.current ?? 0, 0), FORMATIONS - 1)
      shown += (target - shown) * (reduced ? 1 : 0.08)
      const k = Math.min(Math.floor(shown), FORMATIONS - 2)
      const f = smooth(Math.min(Math.max(shown - k, 0), 1))
      const hue = HUE[k] + (HUE[k + 1] - HUE[k]) * f
      const opacity = 1 - Math.min(Math.max(fade.current ?? 0, 0), 1)

      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#05040a'
      ctx.fillRect(0, 0, w, h)
      if (opacity > 0.01) {
        ctx.globalCompositeOperation = 'lighter'
        // Portal core glow, strongest when the ring formation is on screen.
        const ring = Math.max(0, 1 - Math.abs(shown - (FORMATIONS - 1)) * 1.6) * opacity
        if (ring > 0.01) {
          const R = Math.min(w, h) * 0.11
          const g = ctx.createRadialGradient(w * 0.5, h * 0.42, R * 0.4, w * 0.5, h * 0.42, R * 2.6)
          g.addColorStop(0, `hsla(225, 90%, 60%, ${0.22 * ring})`)
          g.addColorStop(0.45, `hsla(240, 85%, 55%, ${0.1 * ring})`)
          g.addColorStop(1, 'hsla(250, 80%, 50%, 0)')
          ctx.fillStyle = g
          ctx.fillRect(0, 0, w, h)
        }
        for (let i = 0; i < all.length; i++) {
          const s = all[i]
          const a = formation(k, s, i, w, h, t)
          const b = formation(k + 1, s, i, w, h, t)
          const p = a.map((v, j) => v + (b[j] - v) * f)
          const light = 58 + s.hue * 22
          const hh = hue + (s.hue - 0.5) * 26
          ctx.beginPath()
          ctx.moveTo(p[0], p[1])
          ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7])
          // Soft halo, then a bright core.
          ctx.strokeStyle = `hsla(${hh}, 85%, ${light}%, ${0.05 * opacity})`
          ctx.lineWidth = 5
          ctx.stroke()
          ctx.strokeStyle = `hsla(${hh}, 90%, ${light + 8}%, ${s.alpha * 0.55 * opacity})`
          ctx.lineWidth = 0.9
          ctx.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [stage, fade])

  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />
}
