import { API_BASE } from '../config'

export type DenialReason = 'revoked' | 'session_ended' | 'not_registered' | 'owner_mismatch'

/** An on-chain write the gateway's relayer signed and paid for. */
export interface RelayedTx {
  txHash: string
  blockNumber: number
  function: string
  explorerUrl: string | null
}

export interface ScopeSummary {
  label: string
  scopeHash: string
  chars: number
  preview: string
}

export interface Ingestion {
  sourceType: 'text' | 'pdf' | 'docx' | 'png' | 'jpeg'
  extraction: 'native' | 'ocr'
  chunking: 'semantic' | 'rules'
  textChars: number
  pages: number | null
  model: string | null
  warnings: string[]
}

export interface UploadResponse {
  sessionId: string
  sessionToken: string
  sessionTokenHeader: string
  expiresAt: number
  filename: string
  scopes: ScopeSummary[]
  ingestion: Ingestion
}

export interface ScopeStatus {
  label: string
  scopeHash: string
  allowed: boolean
  reason: DenialReason | null
  purgedFromMemory: boolean
  revocation: RelayedTx | null
}

export interface SessionStatus {
  sessionId: string
  filename: string
  registry: string
  blockNumber: number
  registration: RelayedTx | null
  ended: RelayedTx | null
  scopes: ScopeStatus[]
}

export interface ChatTurn {
  role: 'user' | 'model'
  content: string
}

export interface RevokeAIMeta {
  sessionId: string
  registry: string
  blockNumber: number
  scopesUsed: string[]
  scopesWithheld: { label: string; reason: DenialReason }[]
  historyTurnsRedacted: number
}

export interface ChatOk {
  reply: string
  /** The model's self-reported explanation of how it answered. */
  reasoning?: string | null
  model: string
  history: ChatTurn[]
  extensions?: { revokeai?: RevokeAIMeta } | null
}

export interface RevocationReceipt {
  type: string
  sessionId: string
  revokedScopeHashes: string[]
  revokedScopesRoot: string
  blockNumber: number
  issuedAt: number
  chainId: number
  registry: string
  signer: string
  signature: string
}

export interface BlockedResponse {
  status: 'blocked'
  message: string
  reason: DenialReason
  /** Gatekeeper audit explanation (deterministic, written by the middleware). */
  reasoning?: string
  deniedScopes: { label: string; scopeHash: string; reason: DenialReason }[]
  blockNumber: number
  registry: string
  chainId: number
  receipt: RevocationReceipt | null
}

export type ChatResult = { kind: 'ok'; data: ChatOk } | { kind: 'blocked'; data: BlockedResponse }

export interface RevokeAIInfo {
  network: string
  chainId: number | null
  registry: string
  rpcUrl: string | null
  explorerUrl: string | null
  receiptSigner: string
  relayer: { configured: boolean; address?: string; balance?: string; lowBalance?: boolean }
  activeSessions: number
}

export interface Health {
  status: 'ok' | 'degraded'
  gemini_configured: boolean
  model: string
  extensions: { revokeai?: RevokeAIInfo }
}

export interface Session {
  id: string
  token: string
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

const TOKEN_HEADER = 'X-RevokeAI-Session-Token'

async function request<T>(path: string, init: RequestInit = {}, session?: Session): Promise<T> {
  const headers = new Headers(init.headers)
  if (session) headers.set(TOKEN_HEADER, session.token)
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'The RevokeAI gateway is unreachable. Is the backend running on port 8000?')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, errorMessage(body) ?? `Request failed (${res.status})`, body)
  return body as T
}

function errorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as { message?: unknown; detail?: unknown }
  if (typeof b.message === 'string') return b.message
  if (typeof b.detail === 'string') return b.detail
  if (b.detail && typeof b.detail === 'object' && 'message' in b.detail) return String((b.detail as { message: unknown }).message)
  if (Array.isArray(b.detail) && b.detail[0]?.msg) return String(b.detail[0].msg)
  return null
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<Health>('/api/health'),

  upload(file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<UploadResponse>('/api/documents/upload', { method: 'POST', body: form })
  },

  status: (s: Session) => request<SessionStatus>(`/api/documents/${s.id}`, {}, s),

  // Gasless writes: the gateway's relayer signs and pays on MST.
  initSession: (s: Session) =>
    request<RelayedTx & { scopeCount: number }>('/api/relayer/initSession', json({ sessionId: s.id }), s),

  revokeScope: (s: Session, scopeHashes: string[]) =>
    request<{ revoked: (RelayedTx & { scopeHash: string })[]; transactions: RelayedTx[] }>(
      '/api/relayer/revokeScope',
      json({ sessionId: s.id, scopeHashes }),
      s,
    ),

  endSession: (s: Session) => request<RelayedTx>('/api/relayer/endSession', json({ sessionId: s.id }), s),

  /** A 403 with status "blocked" is an expected outcome, not an error. */
  async chat(message: string, history: ChatTurn[], session?: Session): Promise<ChatResult> {
    try {
      const data = await request<ChatOk>('/api/chat', json({ message, history, sessionId: session?.id }), session)
      return { kind: 'ok', data }
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { status?: string } | null) : null
      if (err instanceof ApiError && err.status === 403 && body?.status === 'blocked') {
        return { kind: 'blocked', data: body as BlockedResponse }
      }
      throw err
    }
  },
}
