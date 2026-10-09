import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/cn'

/**
 * Glass sheet: slides up from the bottom on phones, scales in centred on
 * larger screens. Escape and the backdrop dismiss it; focus is trapped inside.
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
  const restore = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restore.current = document.activeElement as HTMLElement
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button:not([data-close])')
      first?.focus()
    }, 60)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        )
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
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      restore.current?.focus?.()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-sheet flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 48, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.default }}
            exit={{ opacity: 0, y: 32, scale: 0.97, transition: { duration: 0.16 } }}
            className={cn(
              'glass relative flex max-h-[92dvh] w-full flex-col rounded-t-4xl sm:rounded-4xl',
              size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
            )}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line/20 sm:hidden" aria-hidden />
            <header className="flex items-start gap-3 px-6 pb-2 pt-4 sm:pt-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button
                data-close
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-muted hover:bg-line/10 hover:text-fg"
              >
                <X size={20} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
            {footer && (
              <footer className="flex flex-wrap justify-end gap-3 border-t border-line/10 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Confirmation for destructive actions. */
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
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button onClick={onClose} className="h-11 cursor-pointer rounded-2xl px-5 font-semibold text-muted hover:text-fg">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="h-11 cursor-pointer rounded-2xl bg-danger px-5 font-semibold text-white disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-muted">{message}</p>
    </Sheet>
  )
}
