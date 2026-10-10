import { useQuery } from '@tanstack/react-query'
import { Stop } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { Device } from '@/lib/types'

/** The light an entry gives: one colour for a mood, the loop's colours for an effect. */
function Orb({ colors }: { colors: string[] }) {
  const background = colors.length > 1 ? `conic-gradient(from 210deg, ${[...colors, colors[0]].join(', ')})` : colors[0]
  return <span className="h-6 w-6 shrink-0 rounded-full border border-white/25 shadow-sm" style={{ background }} aria-hidden />
}

/**
 * Moods (still white presets, any light) and effects (colour loops the bulb plays by itself;
 * only the ones this light lists in `options.effect`).
 */
export function LightScenes({ device, disabled, onPick }: { device: Device; disabled: boolean; onPick: (id: string) => void }) {
  const { data } = useQuery({ queryKey: ['effects'], queryFn: api.effects, staleTime: Infinity })
  if (!data) return null
  const s = device.state
  const playable = new Set(s.options?.effect ?? [])
  const effects = data.effects.filter((e) => playable.has(e.id))
  const playing = s.effect ?? null

  const tile = (id: string, name: string, colors: string[], active: boolean) => (
    <button
      key={id}
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={() => onPick(id)}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-label transition-colors duration-base ease-std disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'border-border-strong bg-raised text-fg shadow-sm' : 'border-border bg-panel text-muted hover:bg-raised hover:text-fg',
      )}
    >
      <Orb colors={colors} />
      <span className="truncate font-medium">{name}</span>
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-caption font-medium text-muted">Moods</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.moods.map((m) =>
            // A mood is "on" when the light shows exactly its setting and no effect runs.
            tile(m.id, m.name, m.colors, !playing && s.is_on === true && s.color_mode === 'white' && s.brightness === m.brightness && s.color_temp === m.color_temp),
          )}
        </div>
      </div>
      {effects.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption font-medium text-muted">Effects</span>
            {playing && (
              <button type="button" disabled={disabled} onClick={() => onPick('')} className="flex cursor-pointer items-center gap-1 text-caption text-muted hover:text-fg disabled:cursor-not-allowed">
                <Stop size={12} weight="fill" /> Stop effect
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{effects.map((e) => tile(e.id, e.name, e.colors, playing === e.id))}</div>
        </div>
      )}
    </div>
  )
}
