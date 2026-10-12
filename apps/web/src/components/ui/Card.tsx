import { t } from '@/lib/i18n'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-lg border border-border bg-panel', className)}>{children}</section>
}

export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-3 border-b border-border px-4', className)}>
      <h2 className="text-label font-medium text-muted">{title}</h2>
      {action}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-page font-semibold tracking-[-0.01em]">{title}</h1>
        {description && <p className="mt-1 text-body text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Metric({ label, value, sub, live, info }: { label: string; value: ReactNode; sub?: ReactNode; live?: boolean; info?: string }) {
  return (
    <Card className="p-4 md:p-5">
      <p className="flex items-center gap-2 text-label text-muted">
        {label}
        {live && <StatusDot on label={t('common.live')} />}
        {info && (
          <span tabIndex={0} role="img" aria-label={info} title={info} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] leading-none text-subtle">
            i
          </span>
        )}
      </p>
      <p className="mt-2 text-metric font-semibold tracking-[-0.01em] tabular">{value}</p>
      {sub && <p className="mt-1 truncate text-label text-muted tabular">{sub}</p>}
    </Card>
  )
}

export function StatusDot({ on, label }: { on: boolean; label?: string }) {
  return (
    <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', on ? 'bg-on' : 'bg-subtle')} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'on' | 'warn' | 'danger' | 'info' }) {
  const tones = { neutral: 'text-muted', on: 'text-on', warn: 'text-warn', danger: 'text-danger', info: 'text-info' }
  return <span className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded border border-border bg-raised px-1.5 text-caption font-medium', tones[tone])}>{children}</span>
}

export function EmptyState({ icon, title, message, action }: { icon: ReactNode; title: string; message: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-3 text-subtle">{icon}</div>
      <h3 className="text-title font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-body text-muted">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-raised motion-reduce:animate-none', className)} aria-hidden />
}

export function Notice({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; action?: ReactNode }) {
  const bar = { info: 'bg-info', warn: 'bg-warn', danger: 'bg-danger' }[tone]
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-panel py-3 ps-4 pe-3" role={tone === 'danger' ? 'alert' : 'status'}>
      <span className={cn('absolute inset-y-0 start-0 w-0.5', bar)} aria-hidden />
      <div className="min-w-0 flex-1 text-body">{children}</div>
      {action}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-label text-danger [overflow-wrap:anywhere]">
      {children}
    </p>
  )
}
