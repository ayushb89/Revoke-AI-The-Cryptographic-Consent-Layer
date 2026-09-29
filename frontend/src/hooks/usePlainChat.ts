import { useCallback, useRef, useState } from 'react'

import { api, ApiError } from '../lib/api'
import type { ChatTurn } from '../lib/api'
import type { Message, NewMessage } from './messages'

/** Default mode: an ordinary Gemini chat. No documents, no consent checks. */
export function usePlainChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [thinking, setThinking] = useState(false)
  const nextId = useRef(1)

  const push = useCallback((m: NewMessage) => {
    setMessages((list) => [...list, { ...m, id: nextId.current++ } as Message])
  }, [])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || thinking) return
      push({ kind: 'user', text: message })
      setThinking(true)
      try {
        const result = await api.chat(message, history)
        if (result.kind === 'ok') {
          setHistory(result.data.history)
          push({ kind: 'agent', text: result.data.reply, scopesUsed: [], withheld: [], reasoning: result.data.reasoning ?? undefined, gated: false })
        }
      } catch (err) {
        push({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong talking to the agent.' })
      } finally {
        setThinking(false)
      }
    },
    [history, push, thinking],
  )

  const reset = useCallback(() => {
    setMessages([])
    setHistory([])
  }, [])

  return { messages, thinking, send, reset }
}
