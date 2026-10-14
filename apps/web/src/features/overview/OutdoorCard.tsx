import { t } from '@/lib/i18n'
import { CloudSun } from '@phosphor-icons/react'
import { Badge, Card, CardHeader } from '@/components/ui/Card'
import { airQuality, formatNumber, timeAgo } from '@/lib/format'
import type { Weather } from '@/lib/types'

/** WMO weather code to a phrase. */
export function weatherLabel(code: number | null) {
  if (code == null) return null
  const kind =
    code === 0 ? 'clear'
    : code <= 2 ? 'partlyCloudy'
    : code === 3 ? 'overcast'
    : code === 45 || code === 48 ? 'fog'
    : code >= 51 && code <= 57 ? 'drizzle'
    : (code >= 61 && code <= 67) || (code >= 80 && code <= 82) ? 'rain'
    : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow'
    : code >= 95 ? 'storm'
    : null
  return kind && t(`weather.${kind}`)
}

const toneOf = (tone?: string) => (tone === 'text-danger' ? 'danger' : tone === 'text-warn' ? 'warn' : 'on')

/** Outside the home right now: temperature, sky and outdoor PM2.5, with indoor PM2.5 beside it when known. */
export function OutdoorCard({ weather, indoorPm25 }: { weather: Weather; indoorPm25?: number }) {
  const air = airQuality(weather.pm25 ?? undefined)
  const sky = weatherLabel(weather.weather_code)
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <CloudSun size={16} className="text-muted" />
            {t('weather.title')}
          </span>
        }
        action={<span className="text-caption text-subtle">{t('weather.updated', { when: timeAgo(weather.fetched_at) })}</span>}
      />
      <div className="grid grid-cols-2 gap-4 p-4">
        <div>
          <p className="text-metric font-semibold tabular">{weather.temperature == null ? '—' : `${formatNumber(weather.temperature, 0)}°`}</p>
          <p className="text-label text-muted">
            {[sky, weather.humidity != null && t('weather.humidity', { value: formatNumber(weather.humidity, 0) })].filter(Boolean).join(' · ')}
          </p>
        </div>
        {weather.pm25 != null && (
          <div>
            <p className="text-label text-muted">{t('weather.outdoorPm25')}</p>
            <p className="mt-0.5 flex items-center gap-2">
              <span className="text-title font-semibold tabular">{formatNumber(weather.pm25, 0)}</span>
              <span className="text-caption text-muted">µg/m³</span>
              {air && <Badge tone={toneOf(air.tone)}>{air.label}</Badge>}
            </p>
            {indoorPm25 != null && (
              <p className="mt-1 text-caption text-subtle">
                {t(indoorPm25 > weather.pm25 ? 'weather.indoorWorse' : 'weather.indoorBetter', { value: formatNumber(indoorPm25, 0) })}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
