import { t } from '@/lib/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Check, PaintBrush, Sparkle, Sun } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

export interface LightColorControlsProps {
  color?: string
  colorTemp?: number
  colorMode?: string
  brightness?: number
  isOn?: boolean
  disabled?: boolean
  onChangeColor?: (color: string) => void
  onCommitColor?: (color: string) => void
  onChangeColorTemp?: (temp: number) => void
  onCommitColorTemp?: (temp: number) => void
  onChangeColorMode?: (mode: 'white' | 'color') => void
  /** Rendered under the white presets (moods are white settings). */
  moods?: React.ReactNode
  /** Content of the Effects tab; the tab exists only when this is given. */
  effects?: React.ReactNode
  /** Name of the effect the light is playing: opens the Effects tab and labels the preview. */
  playing?: string
}

export const WHITE_PRESETS = [
  {
    name: t('light.white.candle.name'),
    label: t('light.white.candle.label'),
    kelvin: 2000,
    pct: 0,
    hex: '#FF890E',
  },
  {
    name: t('light.white.softWhite.name'),
    label: t('light.white.softWhite.label'),
    kelvin: 2700,
    pct: 16,
    hex: '#FFA757',
  },
  {
    name: t('light.white.daylight.name'),
    label: t('light.white.daylight.label'),
    kelvin: 5000,
    pct: 67,
    hex: '#FFE4CE',
  },
  {
    name: t('light.white.coolWhite.name'),
    label: t('light.white.coolWhite.label'),
    kelvin: 6500,
    pct: 100,
    hex: '#B2D4FF',
  },
] as const

export const COLOR_PRESETS = [
  { name: t('light.color.amber'), hex: '#F59E0B' },
  { name: t('light.color.gold'), hex: '#EAB308' },
  { name: t('light.color.orange'), hex: '#F97316' },
  { name: t('light.color.red'), hex: '#EF4444' },
  { name: t('light.color.pink'), hex: '#EC4899' },
  { name: t('light.color.purple'), hex: '#A855F7' },
  { name: t('light.color.blue'), hex: '#0EA5E9' },
  { name: t('light.color.cyan'), hex: '#06B6D4' },
  { name: t('light.color.green'), hex: '#10B981' },
  { name: t('light.color.lime'), hex: '#84CC16' },
] as const

/** Converts Kelvin to an RGB object based on Tanner Helland algorithm. */
export function kelvinToRgb(kelvin: number): { r: number; g: number; b: number } {
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100
  let r: number, g: number, b: number

  if (temp <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(temp) - 161.1195681661
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
    b = 255
  }

  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b))),
  }
}

export function kelvinToHex(kelvin: number): string {
  const { r, g, b } = kelvinToRgb(kelvin)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase()
}

/** 0-100% mapped to 2000K-6500K */
export function tempPctToKelvin(pct: number): number {
  return Math.round(2000 + (Math.max(0, Math.min(100, pct)) / 100) * 4500)
}

export function kelvinToTempPct(kelvin: number): number {
  return Math.max(0, Math.min(100, Math.round(((kelvin - 2000) / 4500) * 100)))
}

export function hslToHex(h: number, s: number, l: number): string {
  const lFrac = l / 100
  const a = (s * Math.min(lFrac, 1 - lFrac)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = lFrac - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase()
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let c = hex.replace('#', '').trim()
  if (c.length === 3) c = c.split('').map((x) => x + x).join('')
  const num = parseInt(c, 16)
  if (isNaN(num)) return { h: 36, s: 95, l: 50 }
  const r = ((num >> 16) & 255) / 255
  const g = ((num >> 8) & 255) / 255
  const b = (num & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h = Math.round(h * 60)
  }
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function LightColorControls({
  color,
  colorTemp = 50,
  colorMode,
  brightness = 100,
  isOn = true,
  disabled = false,
  onChangeColor,
  onCommitColor,
  onChangeColorTemp,
  onCommitColorTemp,
  onChangeColorMode,
  moods,
  effects,
  playing,
}: LightColorControlsProps) {
  // Determine active mode: default based on explicit colorMode or presence of color/colorTemp
  const resolvedMode: 'white' | 'color' =
    colorMode === 'white' || colorMode === 'color'
      ? colorMode
      : color && !colorTemp
      ? 'color'
      : 'white'

  // 'effect' is only a view: opening it sends nothing until an effect is picked.
  const [mode, setMode] = useState<'white' | 'color' | 'effect'>(playing ? 'effect' : resolvedMode)
  useEffect(() => {
    if (playing) setMode('effect')
    else if (colorMode === 'white' || colorMode === 'color') setMode(colorMode)
  }, [colorMode, playing])

  // Internal color state
  const currentColor = color || '#F59E0B'
  const [internalColor, setInternalColor] = useState(currentColor)
  useEffect(() => {
    if (color) setInternalColor(color)
  }, [color])

  // Internal color temp
  const [internalTemp, setInternalTemp] = useState(colorTemp)
  useEffect(() => {
    setInternalTemp(colorTemp)
  }, [colorTemp])

  // Hue calculation from current color
  const initialHsl = useMemo(() => hexToHsl(internalColor), [internalColor])
  const [hue, setHue] = useState(initialHsl.h)
  useEffect(() => {
    setHue(initialHsl.h)
  }, [initialHsl.h])

  // Hex input state
  const [hexInput, setHexInput] = useState(internalColor.toUpperCase())
  useEffect(() => {
    setHexInput(internalColor.toUpperCase())
  }, [internalColor])

  // Calculate the active Kelvin and hex for preview
  const currentKelvin = tempPctToKelvin(internalTemp)
  const currentWhiteHex = useMemo(() => kelvinToHex(currentKelvin), [currentKelvin])

  // Live color radiating from the glow indicator
  const activeRadiantHex = (mode === 'effect' ? resolvedMode : mode) === 'white' ? currentWhiteHex : internalColor

  const handleModeChange = (newMode: 'white' | 'color') => {
    setMode(newMode)
    onChangeColorMode?.(newMode)
    if (newMode === 'color') {
      onCommitColor?.(internalColor)
    } else {
      onCommitColorTemp?.(internalTemp)
    }
  }

  const handleTempSliderChange = (newPct: number) => {
    setInternalTemp(newPct)
    onChangeColorTemp?.(newPct)
  }

  const handleTempSliderCommit = (newPct: number) => {
    setInternalTemp(newPct)
    onCommitColorTemp?.(newPct)
  }

  const handleSelectWhitePreset = (pct: number) => {
    setInternalTemp(pct)
    onChangeColorTemp?.(pct)
    onCommitColorTemp?.(pct)
    if (mode !== 'white') {
      setMode('white')
      onChangeColorMode?.('white')
    }
  }

  const handleSelectColorPreset = (hex: string) => {
    setInternalColor(hex)
    setHexInput(hex)
    const hsl = hexToHsl(hex)
    setHue(hsl.h)
    onChangeColor?.(hex)
    onCommitColor?.(hex)
    if (mode !== 'color') {
      setMode('color')
      onChangeColorMode?.('color')
    }
  }

  const handleHueChange = (newHue: number) => {
    setHue(newHue)
    const newHex = hslToHex(newHue, 95, 50)
    setInternalColor(newHex)
    setHexInput(newHex)
    onChangeColor?.(newHex)
  }

  const handleHueCommit = (newHue: number) => {
    const newHex = hslToHex(newHue, 95, 50)
    onCommitColor?.(newHex)
  }

  const handleNativeColorInput = (hex: string) => {
    const upper = hex.toUpperCase()
    setInternalColor(upper)
    setHexInput(upper)
    const hsl = hexToHsl(upper)
    setHue(hsl.h)
    onChangeColor?.(upper)
    onCommitColor?.(upper)
    if (mode !== 'color') {
      setMode('color')
      onChangeColorMode?.('color')
    }
  }

  const handleHexInputChange = (val: string) => {
    const cleaned = val.startsWith('#') ? val : `#${val}`
    setHexInput(cleaned.toUpperCase())
    if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
      const upper = cleaned.toUpperCase()
      setInternalColor(upper)
      const hsl = hexToHsl(upper)
      setHue(hsl.h)
      onChangeColor?.(upper)
      onCommitColor?.(upper)
    }
  }

  const handleHexInputBlur = () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
      setHexInput(internalColor.toUpperCase())
    }
  }

  // White temp descriptive label
  const tempLabel = useMemo(() => {
    if (internalTemp < 10) return t('light.temp.warm')
    if (internalTemp < 30) return t('light.temp.soft')
    if (internalTemp < 60) return t('light.temp.neutral')
    if (internalTemp < 85) return t('light.temp.daylight')
    return t('light.temp.cool')
  }, [internalTemp])

  // Color name descriptor
  const activeColorName = useMemo(() => {
    const match = COLOR_PRESETS.find((p) => p.hex.toLowerCase() === internalColor.toLowerCase())
    return match ? match.name : internalColor.toUpperCase()
  }, [internalColor])

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Ambient Glow Indicator: Liquid glass preview orb */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-b from-panel/90 via-panel/60 to-raised/50 p-4 shadow-sm backdrop-blur-xl">
        {/* Ambient radiance background bloom */}
        <div
          className="pointer-events-none absolute -left-8 -top-8 h-36 w-36 rounded-full blur-3xl transition-all duration-300 ease-std"
          style={{
            backgroundColor: activeRadiantHex,
            opacity: isOn ? Math.max(0.12, (brightness / 100) * 0.45) : 0.02,
          }}
        />

        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* The Liquid Glass Orb */}
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
              {/* Outer soft glow aura */}
              <div
                className="pointer-events-none absolute h-14 w-14 rounded-full blur-md transition-all duration-300 ease-std"
                style={{
                  backgroundColor: activeRadiantHex,
                  opacity: isOn ? (brightness / 100) * 0.8 : 0,
                  transform: isOn ? `scale(${0.9 + (brightness / 100) * 0.35})` : 'scale(0.8)',
                }}
              />

              {/* Sphere body */}
              <div
                className="relative h-13 w-13 rounded-full border border-white/30 shadow-md transition-all duration-300 ease-std dark:border-white/20"
                style={{
                  backgroundColor: isOn ? activeRadiantHex : 'rgb(39, 39, 42)',
                  boxShadow: isOn
                    ? `0 0 ${12 + (brightness / 100) * 20}px ${activeRadiantHex}80, 0 0 ${24 + (brightness / 100) * 32}px ${activeRadiantHex}40, inset 0 2px 4px rgba(255, 255, 255, 0.7), inset 0 -3px 6px rgba(0, 0, 0, 0.35)`
                    : 'inset 0 1px 2px rgba(255, 255, 255, 0.15), 0 2px 6px rgba(0, 0, 0, 0.3)',
                }}
              >
                {/* Liquid glass highlight arc (reflection) */}
                <div className="pointer-events-none absolute left-1.5 right-1.5 top-1 h-3.5 rounded-full bg-gradient-to-b from-white/80 via-white/25 to-transparent blur-[0.4px]" />
                {/* Specular point glint */}
                <div className="pointer-events-none absolute left-2.5 top-1.5 h-1.5 w-1.5 rounded-full bg-white/95" />
                {/* Subtle base shadow */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 rounded-b-full bg-gradient-to-t from-black/25 to-transparent" />
              </div>
            </div>

            {/* Status & info text */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full transition-colors duration-base"
                  style={{ backgroundColor: isOn ? activeRadiantHex : 'rgb(113, 113, 122)' }}
                />
                <span className="text-label font-semibold text-fg">
                  {isOn ? (playing ? t('light.effect') : (mode === 'white' || (mode !== 'color' && resolvedMode === 'white')) ? t('light.whiteLight') : t('light.colorLight')) : t('light.off')}
                </span>
              </div>
              <p className="truncate text-caption text-muted">
                {isOn ? (playing ? t('light.playing', { name: playing }) : (mode === 'effect' ? resolvedMode : mode) === 'white' ? tempLabel : activeColorName) : t('light.bulbOff')}
              </p>
            </div>
          </div>

          {/* Quick mode / brightness chip */}
          <div className="flex flex-col items-end text-caption text-subtle">
            <span className="font-medium text-fg tabular">{isOn ? `${brightness}%` : '0%'}</span>
            <span className="uppercase tracking-wider text-[11px] text-muted">
              {playing ? '' : (mode === 'effect' ? resolvedMode : mode) === 'white' ? `${currentKelvin}K` : activeRadiantHex}
            </span>
          </div>
        </div>
      </div>

      {/* 2. White vs Color Mode Tabs Toggle */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-medium text-muted">{t('light.colorMode')}</span>
        <div role="tablist" aria-label={t('light.modeToggle')} className="inline-flex rounded-md border border-border bg-raised p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'white'}
            disabled={disabled}
            onClick={() => handleModeChange('white')}
            className={cn(
              'flex items-center gap-1.5 rounded-[5px] px-3 py-1 text-label font-medium transition-colors duration-base ease-std',
              mode === 'white'
                ? 'bg-panel text-fg shadow-[0_0_0_1px_rgb(var(--border-strong))]'
                : 'text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            <Sun size={15} />
            <span>{t('light.white')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'color'}
            disabled={disabled}
            onClick={() => handleModeChange('color')}
            className={cn(
              'flex items-center gap-1.5 rounded-[5px] px-3 py-1 text-label font-medium transition-colors duration-base ease-std',
              mode === 'color'
                ? 'bg-panel text-fg shadow-[0_0_0_1px_rgb(var(--border-strong))]'
                : 'text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            <PaintBrush size={15} />
            <span>{t('light.color')}</span>
          </button>
          {effects && (
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'effect'}
              onClick={() => setMode('effect')}
              className={cn(
                'flex items-center gap-1.5 rounded-[5px] px-3 py-1 text-label font-medium transition-colors duration-base ease-std',
                mode === 'effect' ? 'bg-panel text-fg shadow-[0_0_0_1px_rgb(var(--border-strong))]' : 'text-muted hover:text-fg',
              )}
            >
              <Sparkle size={15} />
              <span>{t('light.effects')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Mode Content */}
      {mode === 'effect' ? (
        effects
      ) : mode === 'white' ? (
        /* White Mode Controls */
        <div className="flex flex-col gap-3.5">
          {/* Temperature Slider with visual gradient track */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-body">
              <span className="text-label text-fg">{t('light.colorTemperature')}</span>
              <span className="text-caption text-muted tabular">
                {t('light.kelvinLine', { kelvin: currentKelvin, tone: t(internalTemp < 35 ? 'light.kelvin.warm' : internalTemp > 65 ? 'light.kelvin.cool' : 'light.kelvin.neutral') })}
              </span>
            </div>

            <div className="relative flex h-8 items-center">
              {/* Gradient track */}
              <div
                className="pointer-events-none absolute inset-x-0 h-3 rounded-full border border-border-strong/40 shadow-inner"
                style={{
                  background:
                    'linear-gradient(to right, #FF890E 0%, #FFA757 25%, #FFE4CE 55%, #D6E6FF 80%, #B2D4FF 100%)',
                }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={internalTemp}
                disabled={disabled}
                aria-label={t('light.tempSlider')}
                onChange={(e) => handleTempSliderChange(Number(e.target.value))}
                onPointerUp={(e) => handleTempSliderCommit(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => handleTempSliderCommit(Number((e.target as HTMLInputElement).value))}
                className="relative z-10 h-8 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              {/* Custom thumb */}
              <div
                className="pointer-events-none absolute h-5 w-5 rounded-full border-2 border-white shadow-md transition-transform"
                style={{
                  left: `calc(${internalTemp}% - 10px)`,
                  backgroundColor: currentWhiteHex,
                }}
              />
            </div>

            <div className="flex justify-between text-[11px] text-subtle">
              <span>{t('light.warmAmber')}</span>
              <span>4000K</span>
              <span>{t('light.coolIce')}</span>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="text-caption font-medium text-muted">{t('light.whitePresets')}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WHITE_PRESETS.map((p) => {
                const active = Math.abs(internalTemp - p.pct) <= 7
                return (
                  <button
                    key={p.name}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelectWhitePreset(p.pct)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors duration-base ease-std',
                      active
                        ? 'border-border-strong bg-raised text-fg shadow-sm'
                        : 'border-border bg-panel hover:bg-raised text-muted hover:text-fg',
                      disabled && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30 shadow-sm"
                      style={{ backgroundColor: p.hex }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium leading-tight">{p.label}</div>
                      <div className="text-[10px] text-subtle tabular">{p.kelvin}K</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          {moods}
        </div>
      ) : (
        /* Color Mode Controls */
        <div className="flex flex-col gap-4">
          {/* Preset color chips */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium text-muted">{t('light.vividColors')}</span>
              <span className="text-[11px] text-subtle">{activeColorName}</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {COLOR_PRESETS.map((c) => {
                const active = internalColor.toLowerCase() === c.hex.toLowerCase()
                return (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    disabled={disabled}
                    onClick={() => handleSelectColorPreset(c.hex)}
                    className={cn(
                      'group relative flex h-7 w-7 items-center justify-center rounded-full border border-white/20 shadow-sm transition-transform duration-base ease-std hover:scale-110 active:scale-95',
                      active && 'ring-2 ring-fg ring-offset-2 ring-offset-panel',
                      disabled && 'cursor-not-allowed opacity-40 hover:scale-100',
                    )}
                    style={{ backgroundColor: c.hex }}
                  >
                    {active && <Check size={13} weight="bold" className="text-white drop-shadow-md" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom color picker: Interactive hue slider + native picker + live hex display */}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-raised/30 p-3">
            {/* Hue Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-caption">
                <span className="text-muted">{t('light.hueSlider')}</span>
                <span className="text-subtle tabular">{hue}°</span>
              </div>
              <div className="relative flex h-8 items-center">
                <div
                  className="pointer-events-none absolute inset-x-0 h-3 rounded-full border border-border-strong/40 shadow-inner"
                  style={{
                    background:
                      'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={hue}
                  disabled={disabled}
                  aria-label={t('light.hueSpectrum')}
                  onChange={(e) => handleHueChange(Number(e.target.value))}
                  onPointerUp={(e) => handleHueCommit(Number((e.target as HTMLInputElement).value))}
                  onKeyUp={(e) => handleHueCommit(Number((e.target as HTMLInputElement).value))}
                  className="relative z-10 h-8 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                <div
                  className="pointer-events-none absolute h-5 w-5 rounded-full border-2 border-white shadow-md transition-transform"
                  style={{
                    left: `calc(${(hue / 360) * 100}% - 10px)`,
                    backgroundColor: `hsl(${hue}, 100%, 50%)`,
                  }}
                />
              </div>
            </div>

            {/* Custom picker button & Hex field */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              {/* Native color picker trigger */}
              <label
                className={cn(
                  'relative flex cursor-pointer items-center gap-2 rounded-md border border-border bg-raised px-3 py-1.5 text-label font-medium transition-colors hover:bg-raised/80',
                  disabled && 'pointer-events-none cursor-not-allowed opacity-40',
                )}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-white/30 shadow-sm"
                  style={{ backgroundColor: internalColor }}
                />
                <span className="text-caption text-fg">{t('light.paletteWheel')}</span>
                <input
                  type="color"
                  value={internalColor.startsWith('#') ? internalColor.slice(0, 7) : '#F59E0B'}
                  onChange={(e) => handleNativeColorInput(e.target.value)}
                  disabled={disabled}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={t('light.nativePicker')}
                />
              </label>

              {/* Live Hex Input */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-muted">{t('light.hex')}</span>
                <div className="flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1 font-mono text-caption text-fg shadow-inner">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-white/20"
                    style={{ backgroundColor: internalColor }}
                  />
                  <input
                    type="text"
                    value={hexInput}
                    maxLength={7}
                    disabled={disabled}
                    onChange={(e) => handleHexInputChange(e.target.value)}
                    onBlur={handleHexInputBlur}
                    className="w-18 border-none bg-transparent font-mono text-caption uppercase text-fg outline-none"
                    aria-label={t('light.hexCode')}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
