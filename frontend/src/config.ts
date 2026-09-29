/**
 * Backend base URL. Empty = same origin (the Vite dev server proxies /api to
 * localhost:8000). In production set VITE_API_BASE at build time, e.g. in the
 * Vercel dashboard: https://revokeai-backend.onrender.com (no trailing slash).
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export const MAX_UPLOAD_BYTES = 10_000_000

/** Extensions the gateway can ingest (it re-checks file contents server-side). */
export const ACCEPTED_FILES = '.txt,.md,.markdown,.pdf,.docx,.png,.jpg,.jpeg'

export const shortHex = (hex: string, head = 6, tail = 4) =>
  hex.length <= head + tail + 2 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`

/** Presentation-only hints about how sensitive a scope's label sounds. */
export function sensitivityOf(label: string): 'sensitive' | 'pii' | 'financial' | null {
  const l = label.toLowerCase()
  if (/(hiv|virology|hepatitis|std|sti|mental|genetic)/.test(l)) return 'sensitive'
  if (/(billing|insurance|payment|financial)/.test(l)) return 'financial'
  if (/(identity|contact|patient|personal)/.test(l)) return 'pii'
  return null
}
