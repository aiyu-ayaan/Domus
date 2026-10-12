import type { CSSProperties } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        // 44px tall hit area around a 32x18 track
        'group relative -my-3 flex h-11 w-8 shrink-0 cursor-pointer items-center disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <span
        className={cn(
          'flex h-[18px] w-8 items-center rounded-full p-0.5 transition-colors duration-base ease-std',
          checked ? 'bg-on' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-base ease-std',
            checked && 'translate-x-3.5 rtl:-translate-x-3.5',
          )}
        />
      </span>
    </button>
  )
}

/** Options with an `icon` show it alone until chosen; the chosen one spells its label too. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  size = 'md',
}: {
  value: T | undefined
  options: { value: T; label: string; icon?: Icon }[]
  onChange: (v: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md border border-border bg-raised p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.icon ? o.label : undefined}
            title={o.icon ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] font-medium transition-colors duration-base ease-std',
              size === 'sm' ? 'h-7 px-2.5 text-caption' : 'h-8 px-3 text-label',
              active ? 'bg-panel text-fg shadow-[0_0_0_1px_rgb(var(--border-strong))]' : 'text-muted hover:text-fg',
            )}
          >
            {o.icon && <o.icon size={14} aria-hidden />}
            {(!o.icon || active) && o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Slider({
  value,
  onChange,
  onCommit,
  label,
  min = 0,
  max = 100,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  label: string
  min?: number
  max?: number
  disabled?: boolean
}) {
  return (
    <input
      type="range"
      className="range"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  )
}
