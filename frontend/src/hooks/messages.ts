import type { BlockedResponse, DenialReason } from '../lib/api'

export type Message =
  | { id: number; kind: 'user'; text: string }
  | {
      id: number
      kind: 'agent'
      text: string
      scopesUsed: string[]
      withheld: { label: string; reason: DenialReason }[]
      blockNumber?: number
      redactedBecause?: string[]
      /** Model's self-reported reasoning, shown in the reasoning console. */
      reasoning?: string
      /** True when the reply came through RevokeAI's gated (secure) path. */
      gated?: boolean
    }
  | { id: number; kind: 'blocked'; data: BlockedResponse }
  | { id: number; kind: 'system'; text: string; explorerUrl?: string | null; tone: 'success' | 'danger' }
  | { id: number; kind: 'error'; text: string }

/** A Message minus its id (distributive over the union). */
export type NewMessage = Message extends infer M ? (M extends Message ? Omit<M, 'id'> : never) : never
