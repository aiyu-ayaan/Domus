import { Sun, Moon, CircleHalfTilt } from '@phosphor-icons/react'
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
  const [theme, , { resolved, toggle }] = useTheme()
  const iconSize = size === 'sm' ? 16 : 18

  const config =
    theme === 'system'
      ? {
          label: 'Auto',
          title: `Theme: Auto (${resolved}) · Click for Light`,
          icon: <CircleHalfTilt size={iconSize} aria-hidden />,
        }
      : theme === 'light'
        ? {
            label: 'Light',
            title: 'Theme: Light · Click for Dark',
            icon: <Sun size={iconSize} aria-hidden />,
          }
        : {
            label: 'Dark',
            title: 'Theme: Dark · Click for Auto',
            icon: <Moon size={iconSize} aria-hidden />,
          }

  return (
    <Button
      variant="ghost"
      size={size}
      aria-label={config.title}
      title={config.title}
      onClick={toggle}
      className={cn('transition-colors', className)}
      icon={config.icon}
    >
      {showLabel ? config.label : undefined}
    </Button>
  )
}
