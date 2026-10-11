import { t } from '@/lib/i18n'
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
          label: t('theme.auto'),
          title: t('theme.titleAuto', { resolved }),
          icon: <CircleHalfTilt size={iconSize} aria-hidden />,
        }
      : theme === 'light'
        ? {
            label: t('theme.light'),
            title: t('theme.titleLight'),
            icon: <Sun size={iconSize} aria-hidden />,
          }
        : {
            label: t('theme.dark'),
            title: t('theme.titleDark'),
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
