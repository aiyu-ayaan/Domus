import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'
export interface Toast {
  id: number
  tone: ToastTone
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
}

const ToastContext = createContext<{
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
} | null>(null)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++seq
      setToasts((list) => [...list.slice(-3), { ...t, id }])
      setTimeout(() => dismiss(id), t.tone === 'error' ? 6000 : 4000)
    },
    [dismiss],
  )
  return <ToastContext.Provider value={{ toasts, push, dismiss }}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}

/** Toast an error from a failed mutation. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')
