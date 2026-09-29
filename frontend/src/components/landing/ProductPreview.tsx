/** Static, non-interactive preview of the RevokeAI app in secure mode. */
export function ProductPreview() {
  const scopes = [
    { label: 'Patient Identity', tag: 'PII', state: 'active' },
    { label: 'Lipid Panel', tag: '', state: 'active' },
    { label: 'Virology/HIV Screen', tag: 'Highly sensitive', state: 'revoked' },
    { label: 'Billing Details', tag: 'Financial', state: 'active' },
  ] as const

  return (
    <div aria-hidden="true" className="pointer-events-none overflow-hidden rounded-2xl border border-white/10 bg-[#09090d]/95 font-sans text-left text-zinc-100 shadow-[0_40px_120px_-20px_rgba(124,58,237,0.45)] select-none">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="size-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10" />
          <span className="text-[13px] font-semibold">
            Revoke<span className="text-emerald-400">AI</span>
          </span>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 py-1 pr-1 pl-3 text-[11px] text-emerald-200">
          RevokeAI Security On
          <span className="flex h-4 w-7 items-center rounded-full bg-emerald-500 px-0.5">
            <span className="ml-auto size-3 rounded-full bg-white" />
          </span>
        </span>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-3 rounded-xl border border-white/5 bg-zinc-900/40 p-4">
          <p className="mx-auto w-fit rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1 text-[10.5px] text-emerald-300">
            lab_report.pdf secured: 4 data scopes under on-chain consent
          </p>
          <div className="ml-auto w-fit rounded-2xl rounded-tr-md bg-emerald-500/15 px-3.5 py-2 text-[12px] ring-1 ring-emerald-500/20">
            What was my HIV screen result?
          </div>
          <div className="rounded-2xl border border-red-500/40 bg-red-500/[0.08] p-3.5">
            <p className="font-mono text-[9.5px] tracking-widest text-red-400/80">ACCESS DENIED · REVOKEAI GATEKEEPER</p>
            <p className="mt-1 text-[12.5px] leading-snug text-red-50">
              Access Denied: Permission for Virology/HIV Screen was permanently revoked on MST Blockchain.
            </p>
            <div className="mt-2.5 space-y-1 border-t border-red-500/20 pt-2.5 text-[10.5px] text-zinc-400">
              <p><span className="text-emerald-400">✓</span> LLM call not made: stopped at the gateway</p>
              <p><span className="text-emerald-400">✓</span> On-chain: isRevoked = true</p>
              <p><span className="text-emerald-400">✓</span> EIP-712 receipt matches gateway key</p>
            </div>
          </div>
          <div className="w-4/5 rounded-2xl rounded-tl-md border border-white/5 bg-zinc-900/80 px-3.5 py-2.5 text-[12px] text-zinc-300">
            Your LDL-C is 161 mg/dL, above the reference range of under 100 mg/dL.
          </div>
        </div>

        <div className="hidden rounded-xl border border-white/5 bg-zinc-900/40 md:block">
          <div className="border-b border-white/5 px-4 py-3">
            <p className="text-[12px] font-semibold">Active Agent Data Scopes</p>
            <p className="text-[10.5px] text-zinc-500">Memory checklist · 3 active · 1 revoked</p>
          </div>
          <div className="space-y-2 p-3">
            {scopes.map((s) => (
              <div key={s.label} className={`rounded-lg border p-2.5 ${s.state === 'revoked' ? 'border-red-500/25 bg-red-500/[0.05]' : 'border-white/5 bg-zinc-900/60'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11.5px] ${s.state === 'revoked' ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{s.label}</span>
                  {s.state === 'active' && <span className="rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9.5px] text-red-300">Revoke Access</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`rounded border px-1.5 py-px font-mono text-[9px] ${s.state === 'revoked' ? 'border-red-500/50 bg-red-500/15 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                    {s.state === 'revoked' ? 'REVOKED' : 'ACTIVE'}
                  </span>
                  {s.state === 'revoked' && <span className="text-[9.5px] text-red-300/90 underline">View proof</span>}
                  {s.tag && s.state !== 'revoked' && <span className="text-[9.5px] text-zinc-500">{s.tag}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
