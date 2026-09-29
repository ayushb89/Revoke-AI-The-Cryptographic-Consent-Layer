import type { sensitivityOf } from '../config'

const styles = {
  sensitive: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  pii: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  financial: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
} as const

const labels = { sensitive: 'Highly sensitive', pii: 'PII', financial: 'Financial' } as const

export function SensitivityTag({ kind }: { kind: ReturnType<typeof sensitivityOf> }) {
  if (!kind) return null
  return <span className={`rounded border px-1.5 py-px text-[10px] font-medium ${styles[kind]}`}>{labels[kind]}</span>
}
