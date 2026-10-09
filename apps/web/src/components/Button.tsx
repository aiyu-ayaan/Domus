import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { CircleNotch } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

type Variant = 'primary' | 'glass' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-[0_8px_24px_-8px_rgb(var(--accent)/0.6)] hover:brightness-110',
  glass: 'glass-thin text-fg hover:bg-line/10',
  ghost: 'text-muted hover:text-fg hover:bg-line/[0.07]',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30',
}
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-[15px] gap-2 rounded-2xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-2xl',
}

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'glass', size = 'md', loading, icon, children, className, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.96 }}
      transition={spring.fast}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex cursor-pointer select-none items-center justify-center font-semibold transition-[background,filter,color] duration-200 ease-standard disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <CircleNotch className="animate-spin" size={18} aria-hidden /> : icon}
      {children}
    </motion.button>
  )
})

export function IconButton({
  label,
  children,
  className,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      transition={spring.fast}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl text-muted transition-colors duration-200 hover:bg-line/[0.08] hover:text-fg',
        active && 'text-fg',
        className,
      )}
      {...(rest as HTMLMotionProps<'button'>)}
    >
      {children}
    </motion.button>
  )
}
