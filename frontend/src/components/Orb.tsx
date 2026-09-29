/** Iridescent glass orb (pure CSS). `tone` shifts the halo colour. */
export function Orb({ size = 96, tone = 'violet' }: { size?: number; tone?: 'violet' | 'emerald' }) {
  const halo = tone === 'emerald' ? 'bg-emerald-400/25' : 'bg-violet-500/30'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <div className={`absolute -inset-[45%] rounded-full blur-3xl ${halo}`} />
      <div className="orb-core absolute inset-0 rounded-full" />
      {/* specular highlight + inner shading give the glassy, liquid look */}
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,0.9),rgba(255,255,255,0.18)_20%,transparent_46%)]" />
      <div className="absolute inset-0 rounded-full shadow-[inset_-12px_-16px_28px_rgba(7,7,13,0.7),inset_6px_8px_18px_rgba(255,255,255,0.28)]" />
    </div>
  )
}
