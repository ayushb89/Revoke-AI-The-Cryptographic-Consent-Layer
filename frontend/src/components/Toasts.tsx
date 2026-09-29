import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { ToastContext } from './toast-context'
import type { Push, Tone } from './toast-context'

interface Toast {
  id: number
  tone: Tone
  title: string
  body?: ReactNode
}

const toneStyle: Record<Tone, { icon: ReactNode; ring: string }> = {
  success: { icon: <CheckCircle2 className="size-4 text-emerald-400" />, ring: 'border-emerald-500/30' },
  error: { icon: <TriangleAlert className="size-4 text-red-400" />, ring: 'border-red-500/30' },
  info: { icon: <Info className="size-4 text-sky-400" />, ring: 'border-sky-500/30' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback<Push>(
    (tone, title, body) => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-3), { id, tone, title, body }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 5500)
    },
    [dismiss],
  )

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-20 z-50 mx-auto flex max-w-sm flex-col items-center gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full animate-slide-up gap-3 rounded-xl border bg-zinc-900/95 p-3.5 shadow-2xl shadow-black/40 backdrop-blur ${toneStyle[t.tone].ring}`}
          >
            <div className="mt-0.5">{toneStyle[t.tone].icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100">{t.title}</p>
              {t.body && <div className="mt-0.5 text-xs break-words text-zinc-400">{t.body}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="self-start rounded p-0.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
