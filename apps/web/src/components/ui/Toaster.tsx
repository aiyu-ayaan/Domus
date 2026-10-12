import { CheckCircle, Info, Warning, XCircle, X } from '@phosphor-icons/react'
import { useToast, type ToastTone } from '@/lib/toast'
import { t as tr } from '@/lib/i18n'

const icons: Record<ToastTone, JSX.Element> = {
  info: <Info size={16} className="text-info" />,
  success: <CheckCircle size={16} className="text-on" />,
  warning: <Warning size={16} className="text-warn" />,
  error: <XCircle size={16} className="text-danger" />,
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-20 start-0 end-0 z-toast flex flex-col items-center gap-2 px-4 md:bottom-4 md:start-auto md:end-4 md:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="anim-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-panel p-3"
          style={{ boxShadow: 'var(--overlay-shadow)' }}
        >
          <span className="mt-0.5">{icons[t.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium">{t.title}</p>
            {t.message && <p className="mt-0.5 text-label text-muted [overflow-wrap:anywhere]">{t.message}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} aria-label={tr('common.dismiss')} className="-m-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded text-subtle hover:text-fg">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
