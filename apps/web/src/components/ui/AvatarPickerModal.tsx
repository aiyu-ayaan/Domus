import { useState, useMemo, useEffect } from 'react'
import {
  DiceFive,
  ArrowsClockwise,
  Sparkle,
  Check,
} from '@phosphor-icons/react'
import {
  AVATAR_STYLES,
  parseAvatarSpec,
  toAvatarSpec,
  generateRandomSeed,
  rollRandomAvatar,
  getAvatarUri,
  useAvatarArt,
} from '@/lib/avatar'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Sheet } from './Sheet'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'

interface AvatarPickerModalProps {
  open: boolean
  onClose: () => void
  currentAvatar?: string | null
  username?: string
  onSave: (avatarSpec: string) => Promise<void> | void
  title?: string
}

export function AvatarPickerModal({
  open,
  onClose,
  currentAvatar,
  username = 'user',
  onSave,
  title = t('avatar.customize'),
}: AvatarPickerModalProps) {
  const initial = useMemo(
    () => parseAvatarSpec(currentAvatar, username),
    [currentAvatar, username],
  )

  useAvatarArt() // re-renders the previews when the artwork arrives
  const [selectedStyle, setSelectedStyle] = useState<string>(initial.style)
  const [seed, setSeed] = useState<string>(initial.seed)
  const [saving, setSaving] = useState(false)
  const [rolling, setRolling] = useState(false)

  // Reset state when opening
  useEffect(() => {
    if (open) {
      const p = parseAvatarSpec(currentAvatar, username)
      setSelectedStyle(p.style)
      setSeed(p.seed)
    }
  }, [open, currentAvatar, username])

  const currentSpec = useMemo(
    () => toAvatarSpec(selectedStyle, seed),
    [selectedStyle, seed],
  )

  // Generate quick presets for inspiration
  const presets = useMemo(() => {
    const list: Array<{ style: string; seed: string; spec: string }> = []
    const sampleStyles = ['bottts', 'lorelei', 'avataaars', 'adventurer', 'micah', 'pixelArt', 'funEmoji', 'shapes']
    for (const st of sampleStyles) {
      const s = `${username}_${st}`
      list.push({ style: st, seed: s, spec: toAvatarSpec(st, s) })
    }
    return list
  }, [username])

  const handleRollAll = () => {
    setRolling(true)
    const rolled = rollRandomAvatar()
    setSelectedStyle(rolled.style)
    setSeed(rolled.seed)
    setTimeout(() => setRolling(false), 300)
  }

  const handleRollSeed = () => {
    setRolling(true)
    setSeed(generateRandomSeed())
    setTimeout(() => setRolling(false), 300)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await onSave(currentSpec)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button
            variant="ghost"
            icon={<ArrowsClockwise size={16} className={rolling ? 'animate-spin' : ''} />}
            onClick={handleRollAll}
            title={t('avatar.randomizeHint')}
          >
            {t('avatar.randomize')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={saving}
              icon={<Check size={16} />}
              onClick={handleSave}
            >
              {t('avatar.apply')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Apple Liquid Glass Preview Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-panel/90 via-raised/50 to-panel/90 p-6 text-center backdrop-blur-xl shadow-lg">
          {/* Subtle radiance background glow */}
          <div
            className="pointer-events-none absolute -inset-4 opacity-30 blur-2xl transition-all duration-500"
            style={{
              background:
                'radial-gradient(circle at 50% 40%, var(--color-primary, #3b82f6), transparent 70%)',
            }}
            aria-hidden
          />

          <div className="relative flex flex-col items-center justify-center">
            <div
              className={cn(
                'relative transition-transform duration-300',
                rolling && 'scale-95 rotate-3',
              )}
            >
              <Avatar
                key={currentSpec}
                avatar={currentSpec}
                username={username}
                size="2xl"
                className="shadow-2xl ring-4 ring-panel/90"
              />
              <button
                type="button"
                onClick={handleRollSeed}
                title={t('avatar.rollSeedHint')}
                className="absolute -bottom-1 -right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary shadow-lg ring-2 ring-panel transition-transform hover:scale-110 active:scale-95"
              >
                <DiceFive size={20} weight="fill" className={rolling ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center">
              <span className="text-caption font-semibold uppercase tracking-wider text-muted">
                {t('avatar.styleBadge', { style: AVATAR_STYLES.find((s) => s.id === selectedStyle)?.name || selectedStyle })}
              </span>
              <p className="text-label text-fg/80 max-w-xs truncate">
                {t('avatar.seedLabel')} <span className="font-mono text-fg">{seed}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Style selection grid */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-label font-semibold text-fg">{t('avatar.chooseStyle')}</span>
            <span className="text-caption text-muted">{t('avatar.collections', { count: AVATAR_STYLES.length })}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {AVATAR_STYLES.map((style) => {
              const isSelected = style.id === selectedStyle
              const previewUri = getAvatarUri(style.id, seed || username)
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={cn(
                    'group relative flex flex-col items-center rounded-xl p-2.5 text-center transition-all duration-200 cursor-pointer',
                    'border backdrop-blur-md',
                    isSelected
                      ? 'border-primary bg-primary-container/30 text-fg shadow-sm ring-2 ring-primary/40'
                      : 'border-border/60 bg-raised/40 hover:bg-raised/90 text-muted hover:text-fg',
                  )}
                >
                  <div className="relative mb-1.5 h-10 w-10 overflow-hidden rounded-full ring-1 ring-border/50 group-hover:scale-105 transition-transform">
                    <img src={previewUri ?? undefined} alt={style.name} className="h-full w-full object-cover" />
                  </div>
                  <span className="truncate text-caption font-medium">{style.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom Seed Input & Roll */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-raised/30 p-3.5 backdrop-blur-sm">
          <span className="text-label font-semibold text-fg">{t('avatar.customSeed')}</span>
          <p className="text-caption text-muted">
            {t('avatar.customSeedHint')}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder={t('avatar.seedPlaceholder')}
              className="flex-1 rounded-lg border border-border bg-panel px-3 py-2 text-body text-fg placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              type="button"
              variant="ghost"
              icon={<DiceFive size={18} />}
              onClick={handleRollSeed}
              title={t('avatar.rollRandomSeed')}
            >
              {t('settings.roll')}
            </Button>
          </div>
        </div>

        {/* Quick Inspiration Presets */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-label font-semibold text-fg">
            <Sparkle size={16} weight="fill" className="text-primary" />
            <span>{t('avatar.quickSuggestions')}</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {presets.map((preset, idx) => {
              const isSelected = currentSpec === preset.spec
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedStyle(preset.style)
                    setSeed(preset.seed)
                  }}
                  className={cn(
                    'flex shrink-0 flex-col items-center gap-1 rounded-xl border p-2 transition-all duration-200 cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary-container/20 ring-2 ring-primary/30'
                      : 'border-border/60 bg-panel/70 hover:bg-raised',
                  )}
                >
                  <Avatar avatar={preset.spec} username={username} size="md" ring={false} />
                  <span className="text-[10px] text-muted capitalize font-medium">{preset.style}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
