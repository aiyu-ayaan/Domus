import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { CaretDown, Eye, EyeSlash } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

export const inputCls =
  'h-9 w-full rounded-md border border-border bg-raised px-3 text-body text-fg placeholder:text-subtle transition-colors duration-fast focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-fg/15 disabled:opacity-50'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, className, type, ...rest }, ref) {
  const id = useId()
  const [reveal, setReveal] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label font-medium text-fg">
        {label}
        {rest.required && <span className="text-subtle" aria-hidden> *</span>}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={cn(inputCls, isPassword && 'pr-10', error && 'border-danger/60')}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center text-subtle hover:text-fg"
          >
            {reveal ? <EyeSlash size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export function SelectField({ label, hint, children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <select id={id} className={cn(inputCls, 'cursor-pointer appearance-none pr-8')} {...rest}>
          {children}
        </select>
        <CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
      </div>
      {hint && <p className="text-caption text-subtle">{hint}</p>}
    </div>
  )
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-raised">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 cursor-pointer accent-[rgb(var(--fg))]" />
      {children}
    </label>
  )
}
