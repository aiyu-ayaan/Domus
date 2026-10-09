import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

const inputCls =
  'h-12 w-full rounded-2xl border border-line/10 bg-line/[0.05] px-4 text-base text-fg placeholder:text-subtle transition-colors duration-200 focus:border-accent/60 focus:bg-line/[0.08] focus:outline-none disabled:opacity-50'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className, type, ...rest },
  ref,
) {
  const id = useId()
  const [reveal, setReveal] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-muted">
        {label}
        {rest.required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={cn(inputCls, isPassword && 'pr-12', error && 'border-danger/60')}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-1 my-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted hover:text-fg"
          >
            {reveal ? <EyeSlash size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export function SelectField({
  label,
  hint,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-muted">
        {label}
      </label>
      <select id={id} className={cn(inputCls, 'cursor-pointer appearance-none bg-[length:16px] pr-10')} {...rest}>
        {children}
      </select>
      {hint && <p className="text-sm text-subtle">{hint}</p>}
    </div>
  )
}
