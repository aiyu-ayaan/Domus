import { Sun, Moon } from '@phosphor-icons/react'
import { useTheme } from '@/lib/theme'
import { Button } from './Button'
import { cn } from '@/lib/cn'

export function ThemeToggle({
  className,
  size = 'sm',
  showLabel = false,
}: {
  className?: string
  size?: 'sm' | 'md'
  showLabel?: boolean
}) {
  const [, , { resolved, toggle }] = useTheme()
  const isDark = resolved === 'dark'
  const title = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <Button
      variant="ghost"
      size={size}
      aria-label={title}
      title={title}
      onClick={toggle}
      className={cn('transition-colors', className)}
      icon={isDark ? <Sun size={size === 'sm' ? 16 : 18} aria-hidden /> : <Moon size={size === 'sm' ? 16 : 18} aria-hidden />}
    >
      {showLabel ? (isDark ? 'Light mode' : 'Dark mode') : undefined}
    </Button>
  )
}
