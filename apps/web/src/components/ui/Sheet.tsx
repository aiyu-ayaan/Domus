import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

/**
 * Side drawer on ≥ md, bottom sheet on phones. Escape and the scrim close it;
 * focus moves in on open, is trapped, and returns to the trigger on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  const panel = useRef<HTMLDivElement>(null)
  // Callers pass inline handlers; depending on them would re-run the effect (and steal focus) every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement as HTMLElement | null
    const t = setTimeout(() => {
      panel.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea')?.focus() ?? panel.current?.focus()
    }, 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key !== 'Tab' || !panel.current) return
      const items = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea')
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      trigger?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 top-[var(--titlebar)] z-sheet">
      <div className="anim-fade absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ boxShadow: 'var(--overlay-shadow)' }}
        className={cn(
          'absolute flex flex-col border-border bg-panel focus:outline-none',
          'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-lg border-t anim-enter',
          'md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:rounded-none md:border-l md:border-t-0 md:anim-enter-right',
          size === 'lg' ? 'md:w-[560px]' : 'md:w-[420px]',
        )}
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-title font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-label text-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" icon={<X size={16} />} onClick={onClose} className="-mr-1.5" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  loading?: boolean
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 top-[var(--titlebar)] z-sheet flex items-center justify-center p-4">
      <div className="anim-fade absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div role="alertdialog" aria-modal="true" aria-label={title} className="anim-enter relative w-full max-w-sm rounded-lg border border-border bg-panel p-5" style={{ boxShadow: 'var(--overlay-shadow)' }}>
        <h2 className="text-title font-semibold">{title}</h2>
        <p className="mt-2 text-body text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} autoFocus>
            Cancel
          </Button>
          <Button variant="primary" className="bg-danger text-white hover:bg-danger/90" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
