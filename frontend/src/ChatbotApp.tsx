import { TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { AppSidebar } from './components/AppSidebar'
import { ChatPanel } from './components/ChatPanel'
import { Header } from './components/Header'
import { PlainWelcome } from './components/PlainWelcome'
import { ScopeDrawer } from './components/ScopeDrawer'
import { ScopeReviewModal } from './components/ScopeReviewModal'
import { useToast } from './components/toast-context'
import { UploadPanel } from './components/UploadPanel'
import { usePlainChat } from './hooks/usePlainChat'
import { useRevokeAI } from './hooks/useRevokeAI'
import { api } from './lib/api'
import type { Health } from './lib/api'

const SECURE_KEY = 'revokeai:secure-mode'

function storedSecure(): boolean {
  try {
    return window.localStorage.getItem(SECURE_KEY) === '1'
  } catch {
    return false
  }
}

export default function ChatbotApp() {
  const toast = useToast()
  const plain = usePlainChat()
  const agent = useRevokeAI(toast)
  const [secure, setSecure] = useState(storedSecure)
  const [health, setHealth] = useState<Health | null>(null)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const checkHealth = useCallback(() => {
    api
      .health()
      .then((h) => {
        setHealth(h)
        setBackendOk(true)
      })
      .catch(() => setBackendOk(false))
  }, [])

  useEffect(() => {
    checkHealth()
    const t = window.setInterval(checkHealth, 15_000)
    return () => window.clearInterval(t)
  }, [checkHealth])

  const info = health?.extensions.revokeai
  const secureAvailable = Boolean(info?.relayer.configured)

  const setMode = (on: boolean) => {
    if (on && health && !secureAvailable) {
      toast('error', 'Secure mode unavailable', 'The RevokeAI relayer is not configured on the server.')
      return
    }
    setSecure(on)
    try {
      window.localStorage.setItem(SECURE_KEY, on ? '1' : '0')
    } catch {
      /* per-viewer convenience only */
    }
  }

  const { session } = agent
  const secureActive = secure && secureAvailable

  return (
    <div className="flex h-dvh gap-4 p-3 sm:p-4">
      <AppSidebar secure={secure} backendOk={backendOk} info={info} session={session} onSelectMode={setMode} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
      <Header
        backendOk={backendOk}
        secure={secure}
        secureAvailable={secureAvailable || !health}
        onToggleSecure={() => setMode(!secure)}
        context={secureActive && session?.stage === 'active' ? `Secure workspace · ${session.filename}` : undefined}
      />

      {backendOk === false && (
        <div className="animate-fade-in rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-200">
          <TriangleAlert className="mr-1.5 inline size-3.5" />
          Gateway unreachable. Start it with{' '}
          <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono">.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000</code> in{' '}
          <code className="font-mono">backend</code>.
        </div>
      )}
      {health && !health.gemini_configured && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-200">
          GEMINI_API_KEY is not set on the backend, so the assistant cannot answer yet.
        </div>
      )}
      {secure && health && !secureAvailable && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-200">
          RevokeAI Security is unavailable: the gateway has no relayer configured. Chat still works normally.
        </div>
      )}
      {secureActive && info?.relayer.lowBalance && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-200">
          Operator notice: the consent relayer is low on funds ({info.relayer.balance}). Top it up to keep securing documents.
        </div>
      )}

      <main className="flex min-h-0 w-full flex-1 gap-4">
        {secureActive ? (
          <>
            <ChatPanel
              key="secure"
              secure
              session={session}
              messages={agent.messages}
              thinking={agent.thinking}
              chain={info}
              onSend={agent.send}
              onOpenScopes={() => setDrawerOpen(true)}
              emptyState={<UploadPanel uploading={agent.uploading} onFile={agent.uploadFile} />}
            />
            <ScopeDrawer
              session={session}
              lastUsed={agent.lastUsed}
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              onRefresh={agent.refresh}
              onRevoke={(hashes) => void agent.revoke(hashes)}
              onEndSession={() => void agent.endSession()}
            />
          </>
        ) : (
          <ChatPanel
            key="plain"
            secure={false}
            session={null}
            messages={plain.messages}
            thinking={plain.thinking}
            onSend={plain.send}
            onOpenScopes={() => undefined}
            emptyState={<PlainWelcome onPrompt={plain.send} onEnableSecure={() => setMode(true)} />}
          />
        )}
      </main>
      </div>

      {secureActive && session && session.stage !== 'active' && (
        <ScopeReviewModal session={session} onCancel={agent.discard} onSecure={() => void agent.register()} />
      )}
    </div>
  )
}
