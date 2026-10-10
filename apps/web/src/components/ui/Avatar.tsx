import { useMemo, useState } from 'react'
import { getAvatarUri, parseAvatarSpec } from '@/lib/avatar'
import { cn } from '@/lib/cn'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

interface AvatarProps {
  avatar?: string | null
  username?: string | null
  size?: AvatarSize
  className?: string
  alt?: string
  onClick?: () => void
  interactive?: boolean
  ring?: boolean
}

const sizeClasses: Record<AvatarSize, { box: string; text: string }> = {
  xs: { box: 'h-6 w-6', text: 'text-[10px]' },
  sm: { box: 'h-8 w-8', text: 'text-caption' },
  md: { box: 'h-10 w-10', text: 'text-body' },
  lg: { box: 'h-14 w-14', text: 'text-title' },
  xl: { box: 'h-20 w-20', text: 'text-headline' },
  '2xl': { box: 'h-28 w-28', text: 'text-[32px]' },
}

export function Avatar({
  avatar,
  username = '',
  size = 'md',
  className,
  alt,
  onClick,
  interactive,
  ring = true,
}: AvatarProps) {
  const [loadError, setLoadError] = useState(false)
  const [lastSrc, setLastSrc] = useState<string | null>(null)
  const initial = (username?.trim()?.[0] || 'U').toUpperCase()

  const src = useMemo(() => {
    try {
      return getAvatarUri(avatar || '', username || 'user')
    } catch {
      return null
    }
  }, [avatar, username])

  if (src !== lastSrc) {
    setLastSrc(src)
    setLoadError(false)
  }

  const { box, text } = sizeClasses[size]
  const parsed = useMemo(() => parseAvatarSpec(avatar, username || 'user'), [avatar, username])

  return (
    <div
      onClick={onClick}
      role={onClick || interactive ? 'button' : undefined}
      tabIndex={onClick || interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if ((onClick || interactive) && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full select-none transition-all duration-200 ease-std',
        box,
        ring && 'ring-1 ring-border/60 shadow-sm bg-panel/80 backdrop-blur-md',
        (onClick || interactive) &&
          'cursor-pointer hover:scale-105 active:scale-95 hover:ring-primary/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
      title={alt || username || `Avatar (${parsed.style})`}
    >
      {src && !loadError ? (
        <img
          src={src}
          alt={alt || username || 'User avatar'}
          onError={() => setLoadError(true)}
          className="h-full w-full object-cover transition-opacity duration-200"
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            'flex h-full w-full items-center justify-center font-bold uppercase text-on-primary-container bg-primary-container',
            text,
          )}
        >
          {initial}
        </div>
      )}
    </div>
  )
}
