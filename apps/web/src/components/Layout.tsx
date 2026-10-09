import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { rise } from '@/lib/motion'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  const C = as === 'section' ? motion.section : motion.div
  return (
    <C variants={rise} className={cn('surface rounded-4xl p-5 sm:p-6', className)}>
      {children}
    </C>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between gap-3 first:mt-0">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode
  title: string
  message: ReactNode
  action?: ReactNode
}) {
  return (
    <motion.div variants={rise} className="surface flex flex-col items-center rounded-4xl px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-line/[0.06] text-muted">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-muted">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-3xl bg-line/[0.06] motion-reduce:animate-none', className)} aria-hidden />
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'warn' | 'danger' | 'info' }) {
  const tones = {
    muted: 'bg-line/[0.08] text-muted',
    accent: 'bg-accent/15 text-accent',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    info: 'bg-info/15 text-info',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}
