/**
 * Browser-local demo authentication.
 *
 * Accounts live in localStorage and never leave this browser. Passwords are
 * never stored: each account keeps a random salt and a PBKDF2-SHA256 hash.
 * This gates the demo UI only; it is not server-side security.
 */

const USERS_KEY = 'revokeai:users'
const SESSION_KEY = 'revokeai:session'
const PBKDF2_ITERATIONS = 210_000
export const MIN_PASSWORD_LENGTH = 8

// <name>@gmail.com: the name starts with a letter and may contain letters and digits.
const ACCEPTED_EMAIL = /^[a-z][a-z0-9]{0,63}@gmail\.com$/i

export const EMAIL_ERROR = 'Please use a valid Gmail address, e.g. name123@gmail.com.'

export class AuthError extends Error {}

interface StoredUser {
  email: string
  salt: string
  hash: string
  createdAt: string
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Returns an error message, or null when the address has the accepted format. */
export function validateEmail(raw: string): string | null {
  return ACCEPTED_EMAIL.test(normaliseEmail(raw)) ? null : EMAIL_ERROR
}

export async function signUp(rawEmail: string, password: string): Promise<string> {
  const email = normaliseEmail(rawEmail)
  const emailError = validateEmail(email)
  if (emailError) throw new AuthError(emailError)
  if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`)

  const users = readUsers()
  if (users.some((u) => u.email === email)) throw new AuthError('An account with this email already exists. Sign in instead.')

  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)))
  users.push({ email, salt, hash: await derive(password, salt), createdAt: new Date().toISOString() })
  writeUsers(users)
  return email
}

export async function signIn(rawEmail: string, password: string): Promise<string> {
  const email = normaliseEmail(rawEmail)
  const emailError = validateEmail(email)
  if (emailError) throw new AuthError(emailError)

  const user = readUsers().find((u) => u.email === email)
  // Hash even when the account is missing so both failures take similar time.
  const hash = await derive(password, user?.salt ?? toBase64(new Uint8Array(16)))
  if (!user || hash !== user.hash) throw new AuthError('Incorrect email or password.')

  try {
    window.sessionStorage.setItem(SESSION_KEY, email)
  } catch {
    /* session lasts for this page view only */
  }
  return email
}

export function currentUser(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

async function derive(password: string, saltB64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltB64), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

function readUsers(): StoredUser[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USERS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((u) => u && typeof u.email === 'string' && typeof u.hash === 'string') : []
  } catch {
    return []
  }
}

function writeUsers(users: StoredUser[]) {
  try {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users))
  } catch {
    throw new AuthError('This browser is blocking local storage, so the account could not be saved.')
  }
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
