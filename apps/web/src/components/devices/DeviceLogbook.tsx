import { t } from '@/lib/i18n'
import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from '@/lib/queries'
import { formatMoment, ltr } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import type { Actor, EffectCatalog, LogEntry } from '@/lib/types'

const PAGE = 20

const FIELD_LABEL: Record<string, string> = {
  brightness: 'drawer.brightness',
  color_temp: 'light.colorTemperature',
  color: 'light.color',
  effect: 'light.effect',
  fan_speed: 'drawer.fanSpeed',
  fan_percent: 'drawer.fanSpeed',
  mode: 'drawer.mode',
}

function what(e: LogEntry, catalog?: EffectCatalog) {
  if (e.field === 'is_on') return t(e.value ? 'logbook.turnedOn' : 'logbook.turnedOff')
  if (e.field === 'is_online') return t(e.value ? 'logbook.cameOnline' : 'logbook.wentOffline')
  if (e.field === 'effect' && !e.value) return t('logbook.effectStopped')
  const label = FIELD_LABEL[e.field]
  let value = String(e.value ?? '—')
  if (typeof e.value === 'number') value = ltr(`${e.value}%`)
  if (e.field === 'effect') value = [...(catalog?.effects ?? []), ...(catalog?.moods ?? [])].find((p) => p.id === e.value)?.name ?? value
  return label ? t('logbook.setTo', { field: t(label), value }) : value
}

function who(actor: Actor | null) {
  if (!actor) return t('logbook.onDevice')
  if (actor.kind === 'screen_sync') return t('logbook.screenSync')
  if (actor.kind === 'matter') return t('logbook.matter')
  if (actor.kind === 'automation') return t('logbook.byAutomation', { name: actor.name })
  return actor.client ? t('logbook.byUserFrom', { name: actor.name, app: t(`logbook.client.${actor.client}`) }) : t('logbook.byUser', { name: actor.name })
}

/** The device's recent changes and who made them, newest first. */
export function DeviceLogbook({ deviceId, catalog }: { deviceId: string; catalog?: EffectCatalog }) {
  const [limit, setLimit] = useState(PAGE)
  const { data = [], isLoading } = useQuery({
    queryKey: [...keys.logbook(deviceId), limit],
    queryFn: () => api.logbook(deviceId, limit),
    placeholderData: keepPreviousData,
  })
  if (isLoading) return null
  if (!data.length) return <p className="text-body text-muted">{t('logbook.empty')}</p>
  return (
    <div>
      <ol className="rounded-lg border border-border px-4">
        {data.map((e, i) => (
          <li key={`${e.at}-${e.field}-${i}`} className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-2 last:border-0">
            <div className="flex min-w-0 items-center gap-2">
              {e.field === 'color' && typeof e.value === 'string' && (
                <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: e.value }} aria-hidden />
              )}
              <div className="min-w-0">
                <p className="truncate text-body">{what(e, catalog)}</p>
                {e.field !== 'is_online' && <p className="truncate text-caption text-muted">{who(e.actor)}</p>}
              </div>
            </div>
            <time dateTime={e.at} className="shrink-0 text-caption text-subtle tabular">
              {formatMoment(e.at)}
            </time>
          </li>
        ))}
      </ol>
      {data.length >= limit && limit < 200 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLimit((l) => l + PAGE * 2)}>
          {t('logbook.more')}
        </Button>
      )}
    </div>
  )
}
