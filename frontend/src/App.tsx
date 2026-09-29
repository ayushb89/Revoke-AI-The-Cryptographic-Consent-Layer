import { useEffect, useState } from 'react'

import ChatbotApp from './ChatbotApp'
import { AuthGate } from './components/landing/AuthGate'
import { LandingPage } from './components/landing/LandingPage'
import { currentUser } from './lib/auth'

type Route = 'landing' | 'auth' | 'app'

function readRoute(): Route {
  const hash = window.location.hash
  if (hash === '#/app') return 'app'
  if (hash === '#/auth') return 'auth'
  return 'landing'
}

/** Landing page → enterprise auth gate → the RevokeAI chatbot (unchanged). */
export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [user, setUser] = useState<string | null>(currentUser)

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  const go = (next: Route) => {
    const hash = next === 'landing' ? '#/' : `#/${next}`
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute(next)
  }

  if (route === 'app' && user) return <ChatbotApp />
  if (route === 'app' || route === 'auth') {
    return (
      <AuthGate
        onAuthenticated={(email) => {
          setUser(email)
          go('app')
        }}
        onBack={() => go('landing')}
      />
    )
  }
  return <LandingPage onTryRevokeAI={() => go(user ? 'app' : 'auth')} />
}
