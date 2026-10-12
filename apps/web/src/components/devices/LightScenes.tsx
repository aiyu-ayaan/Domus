import { t } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { Stop } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { Device, LightPreset } from '@/lib/types'

export const useEffectCatalog = () => useQuery({ queryKey: ['effects'], queryFn: api.effects, staleTime: Infinity })

/** The light an entry gives: one colour for a mood, the loop's colours for an effect. */
function Orb({ colors }: { colors: string[] }) {
  const background = colors.length > 1 ? `conic-gradient(from 210deg, ${[...colors, colors[0]].join(', ')})` : colors[0]
  return <span className="h-6 w-6 shrink-0 rounded-full border border-white/25 shadow-sm" style={{ background }} aria-hidden />
}

function Tiles({ presets, active, disabled, onPick }: { presets: LightPreset[]; active: (p: LightPreset) => boolean; disabled: boolean; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {presets.map((p) => {
        const on = active(p)
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            title={p.name}
            onClick={() => onPick(p.id)}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-start text-label transition-colors duration-base ease-std disabled:cursor-not-allowed disabled:opacity-40',
              on ? 'border-border-strong bg-raised text-fg shadow-sm' : 'border-border bg-panel text-muted hover:bg-raised hover:text-fg',
            )}
          >
            <Orb colors={p.colors} />
            <span className="truncate font-medium">{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Still white presets with a brightness; any light can show them. */
export function LightMoods({ device, disabled, onPick }: { device: Device; disabled: boolean; onPick: (id: string) => void }) {
  const { data } = useEffectCatalog()
  const s = device.state
  if (!data?.moods.length) return null
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <span className="text-caption font-medium text-muted">{t('light.moods')}</span>
      <Tiles
        presets={data.moods}
        disabled={disabled}
        onPick={onPick}
        // A mood is "on" when the light shows exactly its setting and no effect runs.
        active={(m) => !s.effect && s.is_on === true && s.color_mode === 'white' && s.brightness === m.brightness && s.color_temp === m.color_temp}
      />
    </div>
  )
}

/** Colour loops the bulb plays by itself; only the ones this light lists in `options.effect`. */
export function LightEffects({ device, disabled, onPick }: { device: Device; disabled: boolean; onPick: (id: string) => void }) {
  const { data } = useEffectCatalog()
  const playable = new Set(device.state.options?.effect ?? [])
  const playing = device.state.effect ?? null
  return (
    <div className="flex flex-col gap-2">
      {playing && (
        <button type="button" disabled={disabled} onClick={() => onPick('')} className="flex cursor-pointer items-center gap-1 self-start text-caption text-muted hover:text-fg disabled:cursor-not-allowed">
          <Stop size={12} weight="fill" /> {t('light.stopEffect')}
        </button>
      )}
      <Tiles presets={(data?.effects ?? []).filter((e) => playable.has(e.id))} disabled={disabled} onPick={onPick} active={(e) => e.id === playing} />
    </div>
  )
}
