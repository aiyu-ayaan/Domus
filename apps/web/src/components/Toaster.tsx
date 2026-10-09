import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle, Info, Warning, XCircle, X } from '@phosphor-icons/react'
import { useToast, type ToastTone } from '@/lib/toast'
import { spring } from '@/lib/motion'

const icons: Record<ToastTone, JSX.Element> = {
  info: <Info size={20} weight="fill" className="text-info" />,
  success: <CheckCircle size={20} weight="fill" className="text-power" />,
  warning: <Warning size={20} weight="fill" className="text-warn" />,
  error: <XCircle size={20} weight="fill" className="text-danger" />,
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-toast flex flex-col items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:items-end"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.bouncy }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
            className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-3xl p-4"
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="mt-0.5">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t.title}</p>
              {t.message && <p className="mt-0.5 text-sm text-muted [overflow-wrap:anywhere]">{t.message}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-m-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-muted hover:text-fg"
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
