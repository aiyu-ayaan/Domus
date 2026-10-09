import { useId, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  tone = 'accent',
  size = 'md',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  tone?: 'accent' | 'light' | 'air' | 'power'
  size?: 'sm' | 'md'
}) {
  const track = { accent: 'bg-accent', light: 'bg-light', air: 'bg-air', power: 'bg-power' }[tone]
  const dims = size === 'sm' ? 'h-6 w-10 p-0.5' : 'h-8 w-[52px] p-1'
  const knob = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
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
        'relative flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-standard disabled:cursor-not-allowed disabled:opacity-40',
        dims,
        checked ? track : 'bg-line/15',
        checked ? 'justify-end' : 'justify-start',
      )}
    >
      <motion.span
        layout
        transition={spring.bouncy}
        className={cn('block rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.3)]', knob)}
      />
    </button>
  )
}

/** Glass segmented control; the selection pill morphs between options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  size = 'md',
}: {
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('glass-thin inline-flex rounded-2xl p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex-1 cursor-pointer whitespace-nowrap rounded-xl font-semibold capitalize transition-colors duration-200',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
              active ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring.default}
                className="absolute inset-0 rounded-xl bg-line/[0.14] shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]"
              />
            )}
            <span className="relative">{o.label}</span>
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
  tone = 'accent',
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  label: string
  min?: number
  max?: number
  tone?: 'accent' | 'light' | 'air'
  disabled?: boolean
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      className="slider w-full disabled:opacity-40"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      style={{ '--fill': `${fill}%`, '--track-color': `var(--${tone})` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  )
}
