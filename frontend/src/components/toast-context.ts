import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export type Tone = 'success' | 'error' | 'info'
export type Push = (tone: Tone, title: string, body?: ReactNode) => void

export const ToastContext = createContext<Push>(() => undefined)

export function useToast(): Push {
  return useContext(ToastContext)
}
