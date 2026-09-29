import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { AuthError, MIN_PASSWORD_LENGTH, signIn, signUp, validateEmail } from '../../lib/auth'

type Mode = 'signin' | 'signup'

interface Props {
  onAuthenticated: (email: string) => void
  onBack: () => void
}

export function AuthGate({ onAuthenticated, onBack }: Props) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const ids = { email: useId(), password: useId(), confirm: useId(), emailErr: useId(), formErr: useId() }

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const switchMode = (next: Mode) => {
    setMode(next)
    setFormError(null)
    setEmailError(null)
    setNotice(null)
    setPassword('')
    setConfirm('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setNotice(null)
    const invalid = validateEmail(email)
    setEmailError(invalid)
    if (invalid) {
      emailRef.current?.focus()
      return
    }
    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD_LENGTH) return setFormError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`)
      if (password !== confirm) return setFormError('Passwords do not match.')
    } else if (!password) {
      return setFormError('Enter your password.')
    }

    setBusy(true)
    try {
      if (mode === 'signup') {
        const created = await signUp(email, password)
        switchMode('signin')
        setEmail(created)
        setNotice('Account created. Sign in to continue.')
        window.setTimeout(() => passwordRef.current?.focus(), 0)
      } else {
        onAuthenticated(await signIn(email, password))
      }
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const field =
    'mt-1.5 w-full rounded-xl border bg-white/[0.04] px-4 py-3 text-[16px] text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/70 focus:bg-white/[0.06]'

  return (
    <div className="landing-root flex min-h-screen flex-col bg-[#05040a] bg-[radial-gradient(60rem_35rem_at_50%_-10%,rgba(124,58,237,0.22),transparent_60%)] text-white">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <button onClick={onBack} className="font-heading flex items-center gap-1.5 text-[19px] leading-none" aria-label="Back to RevokeAI home">
          <span>
            RevokeAI<sup className="ml-0.5 text-[0.45em]">&reg;</sup>
          </span>
        </button>
        <button onClick={onBack} className="text-[11px] font-semibold tracking-[0.18em] text-white/70 uppercase transition hover:text-white">
          Back
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md animate-slide-up">
          <h1 className="font-heading text-[34px] leading-tight">{mode === 'signin' ? 'Sign in to RevokeAI' : 'Create your workspace access'}</h1>
          <p className="mt-2 text-[16px] text-white/55">Sign in with your Gmail address.</p>

          <div className="mt-7 grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-[14px]" role="tablist" aria-label="Authentication mode">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`rounded-full py-2 transition ${mode === m ? 'bg-white text-black shadow-sm' : 'text-white/55 hover:text-white'}`}
              >
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor={ids.email} className="text-[14px] text-white/70">
                Email
              </label>
              <input
                ref={emailRef}
                id={ids.email}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name123@gmail.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                onBlur={() => email && setEmailError(validateEmail(email))}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? ids.emailErr : undefined}
                className={`${field} ${emailError ? 'border-red-400/80' : 'border-white/15'}`}
              />
              {emailError && (
                <p id={ids.emailErr} role="alert" className="mt-1.5 text-[14px] text-red-300">
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor={ids.password} className="text-[14px] text-white/70">
                  Password
                </label>
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="text-[13px] text-white/50 underline underline-offset-2 hover:text-white">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                ref={passwordRef}
                id={ids.password}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters` : ''}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} border-white/15`}
              />
            </div>

            {mode === 'signup' && (
              <div className="animate-fade-in">
                <label htmlFor={ids.confirm} className="text-[14px] text-white/70">
                  Confirm password
                </label>
                <input
                  id={ids.confirm}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={`${field} border-white/15`}
                />
              </div>
            )}

            {formError && (
              <p id={ids.formErr} role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-200">
                {formError}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[14px] text-emerald-200">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-white py-3.5 text-[13px] font-semibold tracking-[0.14em] text-black uppercase transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : mode === 'signin' ? 'Sign In' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-[14px] text-white/50">
            {mode === 'signin' ? 'New to RevokeAI? ' : 'Already have access? '}
            <button onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} className="text-white underline underline-offset-2 hover:opacity-70">
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="mt-8 text-center text-[12px] leading-relaxed text-white/35">
            Demo access. Accounts are stored only in this browser, and passwords are kept as salted hashes, never in plain text.
          </p>
        </div>
      </main>
    </div>
  )
}
