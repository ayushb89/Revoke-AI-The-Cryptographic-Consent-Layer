import { useCallback, useEffect, useRef, useState } from 'react'

import { MAX_UPLOAD_BYTES } from '../config'
import { api, ApiError } from '../lib/api'
import type { ChatTurn, Ingestion, RelayedTx, ScopeSummary, SessionStatus } from '../lib/api'
import type { Message, NewMessage } from './messages'

export type ScopeState = 'pending' | 'active' | 'revoking' | 'revoked' | 'ended' | 'mismatch'

export interface ScopeView extends ScopeSummary {
  state: ScopeState
  purged: boolean
  proof?: RelayedTx | null
}

export interface ActiveSession {
  id: string
  token: string
  filename: string
  scopes: ScopeView[]
  stage: 'review' | 'registering' | 'active'
  ingestion?: Ingestion
  registration?: RelayedTx
  registerError?: string
}

type Notify = (tone: 'success' | 'error' | 'info', title: string, body?: string) => void

const ACCEPTED_EXT = /\.(txt|md|markdown|text|pdf|docx|png|jpe?g)$/i

function stateFrom(s: SessionStatus['scopes'][number]): ScopeState {
  if (s.allowed) return 'active'
  switch (s.reason) {
    case 'revoked':
      return 'revoked'
    case 'session_ended':
      return 'ended'
    case 'owner_mismatch':
      return 'mismatch'
    default:
      return 'pending'
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Unexpected error')

/** Secure mode: document ingestion, gasless on-chain consent, gated chat. */
export function useRevokeAI(notify: Notify) {
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [uploading, setUploading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [lastUsed, setLastUsed] = useState<string[]>([])
  const nextId = useRef(1)
  // Latest session for async callbacks, without re-creating them per render.
  const sessionRef = useRef<ActiveSession | null>(null)
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const push = useCallback((m: NewMessage) => {
    setMessages((list) => [...list, { ...m, id: nextId.current++ } as Message])
  }, [])

  const patchScopes = useCallback((fn: (s: ScopeView) => ScopeView) => {
    setSession((cur) => (cur ? { ...cur, scopes: cur.scopes.map(fn) } : cur))
  }, [])

  const refresh = useCallback(async () => {
    const cur = sessionRef.current
    if (!cur) return
    try {
      const status = await api.status({ id: cur.id, token: cur.token })
      const byHash = new Map(status.scopes.map((s) => [s.scopeHash, s]))
      patchScopes((s) => {
        const st = byHash.get(s.scopeHash)
        if (!st || s.state === 'revoking') return s
        return { ...s, state: stateFrom(st), purged: st.purgedFromMemory, proof: st.revocation ?? status.ended ?? s.proof }
      })
    } catch (err) {
      notify('error', 'Could not refresh consent status', errorText(err))
    }
  }, [notify, patchScopes])

  // ---- ingestion ---------------------------------------------------------

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_EXT.test(file.name)) {
        notify('error', 'Unsupported file', 'Upload a PDF, Word (.docx), image (.png/.jpg) or text (.txt/.md) file.')
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        notify('error', 'File too large', 'Documents are limited to 10 MB.')
        return
      }
      setUploading(true)
      try {
        const up = await api.upload(file)
        setSession({
          id: up.sessionId,
          token: up.sessionToken,
          filename: up.filename,
          stage: 'review',
          ingestion: up.ingestion,
          scopes: up.scopes.map((s) => ({ ...s, state: 'pending', purged: false })),
        })
      } catch (err) {
        notify('error', 'Upload failed', errorText(err))
      } finally {
        setUploading(false)
      }
    },
    [notify],
  )

  const discard = useCallback(() => {
    setSession(null)
    setMessages([])
    setHistory([])
    setLastUsed([])
  }, [])

  /** Relayer registers the scopes on-chain; the user never signs or pays. */
  const register = useCallback(async () => {
    const cur = sessionRef.current
    if (!cur || cur.stage === 'registering') return
    setSession({ ...cur, stage: 'registering', registerError: undefined })
    try {
      const tx = await api.initSession({ id: cur.id, token: cur.token })
      setSession((s) =>
        s ? { ...s, stage: 'active', registration: tx, scopes: s.scopes.map((x) => ({ ...x, state: 'active' })) } : s,
      )
      setMessages([])
      setHistory([])
      push({
        kind: 'system',
        tone: 'success',
        text: `${cur.filename} secured: ${tx.scopeCount} data scopes under on-chain consent`,
        explorerUrl: tx.explorerUrl,
      })
    } catch (err) {
      setSession((s) => (s ? { ...s, stage: 'review', registerError: errorText(err) } : s))
    }
  }, [push])

  // ---- chat --------------------------------------------------------------

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || thinking) return
      const cur = sessionRef.current
      const active = cur && cur.stage === 'active' ? { id: cur.id, token: cur.token } : undefined
      push({ kind: 'user', text: message })
      setThinking(true)
      try {
        const result = await api.chat(message, history, active)
        if (result.kind === 'blocked') {
          push({ kind: 'blocked', data: result.data })
          if (result.data.reason === 'revoked' || result.data.reason === 'session_ended') void refresh()
          return
        }
        const meta = result.data.extensions?.revokeai
        const used = meta?.scopesUsed ?? []
        // A reply can land after the user revoked a scope it was grounded in
        // (revocation raced the model call): scrub it on arrival.
        const nowRevoked = new Set(
          (sessionRef.current?.scopes ?? [])
            .filter((s) => s.state === 'revoked' || s.state === 'ended' || s.state === 'revoking')
            .map((s) => s.label),
        )
        const stale = used.filter((l) => nowRevoked.has(l))
        setHistory(result.data.history)
        setLastUsed(used)
        push({
          kind: 'agent',
          text: result.data.reply,
          scopesUsed: used,
          withheld: meta?.scopesWithheld ?? [],
          blockNumber: meta?.blockNumber,
          reasoning: result.data.reasoning ?? undefined,
          gated: Boolean(meta),
          ...(stale.length ? { redactedBecause: stale } : {}),
        })
      } catch (err) {
        push({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong talking to the agent.' })
      } finally {
        setThinking(false)
      }
    },
    [history, push, refresh, thinking],
  )

  // ---- revocation (gasless) ------------------------------------------------

  const runRevocation = useCallback(
    async (hashes: string[], mode: 'scopes' | 'end') => {
      const cur = sessionRef.current
      if (!cur || hashes.length === 0) return
      const s = { id: cur.id, token: cur.token }
      const targets = new Set(hashes)
      const labels = cur.scopes.filter((x) => targets.has(x.scopeHash)).map((x) => x.label)

      patchScopes((x) => (targets.has(x.scopeHash) ? { ...x, state: 'revoking' } : x))
      try {
        const proofs = new Map<string, RelayedTx>()
        let headline: RelayedTx
        if (mode === 'end') {
          headline = await api.endSession(s)
          hashes.forEach((h) => proofs.set(h, headline))
        } else {
          const res = await api.revokeScope(s, hashes)
          res.revoked.forEach((r) => proofs.set(r.scopeHash, r))
          headline = res.transactions[res.transactions.length - 1]
        }
        // Instant UI update from the returned tx; the refresh below re-reads chain state.
        patchScopes((x) =>
          targets.has(x.scopeHash)
            ? { ...x, state: mode === 'end' ? 'ended' : 'revoked', purged: true, proof: proofs.get(x.scopeHash) ?? headline }
            : x,
        )
        // Visually scrub earlier answers grounded in the revoked data; the
        // server independently redacts them from history on the next turn.
        setMessages((list) =>
          list.map((m) => {
            if (m.kind !== 'agent') return m
            const hit = m.scopesUsed.filter((l) => labels.includes(l))
            return hit.length ? { ...m, redactedBecause: [...(m.redactedBecause ?? []), ...hit] } : m
          }),
        )
        push({
          kind: 'system',
          tone: 'danger',
          text: mode === 'end' ? 'Session ended: every data scope revoked on-chain' : `Access revoked on-chain: ${labels.join(', ')}`,
          explorerUrl: headline.explorerUrl,
        })
        void refresh()
      } catch (err) {
        patchScopes((x) => (targets.has(x.scopeHash) ? { ...x, state: 'active' } : x))
        notify('error', 'Revocation not completed', errorText(err))
      }
    },
    [notify, patchScopes, push, refresh],
  )

  const revoke = useCallback((hashes: string[]) => runRevocation(hashes, 'scopes'), [runRevocation])

  const endSession = useCallback(() => {
    const live = sessionRef.current?.scopes.filter((x) => x.state === 'active').map((x) => x.scopeHash) ?? []
    return runRevocation(live, 'end')
  }, [runRevocation])

  return {
    session,
    messages,
    uploading,
    thinking,
    lastUsed,
    uploadFile,
    discard,
    register,
    send,
    revoke,
    endSession,
    refresh,
  }
}
