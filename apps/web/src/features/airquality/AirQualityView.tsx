import { useMemo, useState } from 'react'
import { useConfirmSwitch } from '@/components/devices/ConfirmSwitch'
import { useQuery } from '@tanstack/react-query'
import { CalendarBlank, CalendarDot, CalendarDots, Clock, Pulse, Wind, ShieldCheck } from '@phosphor-icons/react'
import { Card, CardHeader, Metric, PageHeader, Badge, Skeleton, EmptyState } from '@/components/ui/Card'
import { Segmented, Switch } from '@/components/ui/Controls'
import { useCanControl } from '@/lib/auth'
import { TrendChart } from '@/components/devices/TrendChart'
import { HourGrid } from '@/components/devices/HourGrid'
import { FanSpeedSlider } from '@/components/devices/FanSpeedSlider'
import { api } from '@/lib/api'
import { useLive } from '@/lib/liveSamples'
import { t } from '@/lib/i18n'
import { keys, useCommand, useDevices, useRooms } from '@/lib/queries'
import { airQuality, formatBucket, formatNumber, type Range } from '@/lib/format'
import type { AirPoint } from '@/lib/types'
import { cn } from '@/lib/cn'

const RANGES = [
  { value: 'live' as const, label: 'common.live', icon: Pulse },
  { value: 'hour' as const, label: 'energy.range.hour', icon: Clock },
  { value: 'day' as const, label: 'energy.range.day', icon: CalendarDot },
  { value: 'week' as const, label: 'energy.range.week', icon: CalendarDots },
  { value: 'month' as const, label: 'energy.range.month', icon: CalendarBlank },
]
type Reading = 'pm25' | 'temperature' | 'humidity'
const READINGS: Record<Reading, { label: string; unit: string; digits: number }> = {
  pm25: { label: 'reading.pm25', unit: 'µg/m³', digits: 0 },
  temperature: { label: 'reading.temperature', unit: '°C', digits: 1 },
  humidity: { label: 'reading.humidity', unit: '%', digits: 0 },
}

/** The WHO levels of the scale card, in the order of `AirPoint.levels`. */
const LEVELS = [
  { label: 'air.excellent', bar: 'bg-on/60' },
  { label: 'air.good', bar: 'bg-on' },
  { label: 'air.moderate', bar: 'bg-warn' },
  { label: 'air.poor', bar: 'bg-danger' },
]
const levelOf = (pm: number) => (pm <= 12 ? 0 : pm <= 35 ? 1 : pm <= 55 ? 2 : 3)

/** Recorded history: the chart, and what it says about the period. */
function Trend() {
  const [range, setRange] = useState<Range>('day')
  const [reading, setReading] = useState<Reading>('pm25')
  const history = useQuery({ queryKey: keys.airHistory(range), queryFn: () => api.airHistory(range as Exclude<Range, 'live'>), enabled: range !== 'live', refetchInterval: 60_000 })
  const { data: devices = [] } = useDevices()
  // Live follows the page's headline: the worst PM2.5 online, the sensors' average climate.
  const mean = (values: (number | undefined)[]) => {
    const v = values.filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const online = devices.filter((d) => d.is_online)
  const livePm = online.flatMap((d) => (d.state.air_quality_pm25 == null ? [] : [d.state.air_quality_pm25]))
  const live = useLive(() => ({
    pm25: livePm.length ? Math.max(...livePm) : null,
    temperature: mean(online.map((d) => d.state.temperature)),
    humidity: mean(online.map((d) => d.state.humidity)),
  }))
  const hours = useQuery({ queryKey: keys.airHistory('hours'), queryFn: () => api.airHistory('hours'), refetchInterval: 300_000 })
  const data: AirPoint[] = range === 'live' ? live : history.data ?? []
  const isLoading = range !== 'live' && history.isLoading
  // Offer only the readings the home's devices actually report.
  const available = (Object.keys(READINGS) as Reading[]).filter((r) => r === 'pm25' || data.some((p) => p[r] != null))
  const shown = available.includes(reading) ? reading : 'pm25'
  const meta = READINGS[shown]

  const pm = data.flatMap((p) => (p.pm25 == null ? [] : [p]))
  const average = pm.length ? pm.reduce((s, p) => s + p.pm25!, 0) / pm.length : null
  // The highest single reading, not the highest average: a short spike counts.
  const top = (p: AirPoint) => p.pm25_max ?? p.pm25!
  const peak = pm.reduce<AirPoint | null>((best, p) => (best == null || top(p) > top(best) ? p : best), null)
  // Samples per level over the period. A live sample is one reading at its own level.
  const levels = [0, 0, 0, 0]
  pm.forEach((p) => (p.levels ? p.levels.forEach((n, i) => (levels[i] += n)) : levels[levelOf(p.pm25!)]++))
  const samples = levels.reduce((a, b) => a + b, 0)
  const share = (n: number) => (samples ? (n / samples) * 100 : 0)
  const clean = samples ? share(levels[0] + levels[1]) : null
  const when = (ts: string) => formatBucket(ts, range)
  const lastTitle = range === 'live' ? t('air.last.live') : range === 'hour' ? t('air.last.hour') : range === 'day' ? t('air.last.day') : range === 'week' ? t('air.last.week') : t('air.last.month')

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title={t('air.trend')}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              {available.length > 1 && (
                <Segmented size="sm" label={t('air.reading')} value={shown} onChange={setReading} options={available.map((r) => ({ value: r, label: t(READINGS[r].label) }))} />
              )}
              <Segmented<Range> size="sm" label={t('energy.range')} value={range} onChange={setRange} options={RANGES.map((r) => ({ ...r, label: t(r.label) }))} />
            </div>
          }
        />
        <div className="p-4">
          {isLoading ? (
            <Skeleton className="h-[240px]" />
          ) : (
            <TrendChart
              points={data.map((p) => ({ t: p.t, value: p[shown], peak: shown === 'pm25' ? p.pm25_max : undefined }))}
              range={range}
              unit={meta.unit}
              digits={meta.digits}
              marks={shown === 'pm25' ? [{ value: 15, label: t('air.mark.clean') }, { value: 35, label: t('air.mark.good') }] : []}
              empty={t('air.noHistory')}
              height={200}
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={lastTitle} />
        <dl className="divide-y divide-border">
          <TrendFact label={t('air.averagePm25')} value={average != null ? `${formatNumber(average, 0)} µg/m³` : '—'} sub={airQuality(average ?? undefined)?.label ?? t('air.noReadingsYet')} />
          <TrendFact label={t('air.peak')} value={peak ? `${formatNumber(top(peak), 0)} µg/m³` : '—'} sub={peak ? when(peak.t) : t('air.noReadingsYet')} />
          <TrendFact label={t('air.timeWithGoodAir')} value={clean != null ? `${formatNumber(clean, 0)}%` : '—'} sub={t('air.pm25Below35')} />
        </dl>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title={t('air.byHour')} />
        <div className="p-4">
          {hours.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <HourGrid
              points={(hours.data ?? []).map((p) => ({ t: p.t, value: p.pm25_max ?? p.pm25 }))}
              format={(v) => `${formatNumber(v, 0)} µg/m³`}
              tone={(v) => ['bg-fg', 'bg-fg', 'bg-warn', 'bg-danger'][levelOf(v)]}
              label={t('air.byHour')}
              empty={t('air.noHistory')}
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('air.levels')} />
        <div className="space-y-3 p-4">
          {/* The same share is written out below, so the bar is decoration for assistive tech. */}
          <div className="flex h-2 gap-px overflow-hidden rounded-full bg-raised" aria-hidden>
            {LEVELS.map((l, i) => levels[i] > 0 && <span key={l.label} className={l.bar} style={{ width: `${share(levels[i])}%` }} />)}
          </div>
          <dl className="space-y-2 text-label">
            {LEVELS.map((l, i) => (
              <div key={l.label} className="flex items-center justify-between">
                <dt className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', l.bar)} aria-hidden />
                  {t(l.label)}
                </dt>
                <dd className="tabular text-muted">{samples ? `${formatNumber(share(levels[i]), 0)}%` : '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-border pt-3 text-caption text-muted">{lastTitle}</p>
        </div>
      </Card>
    </div>
  )
}

function TrendFact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <dt className="text-label text-muted">{label}</dt>
        <dd className="truncate text-caption text-subtle">{sub}</dd>
      </div>
      <dd className="text-title font-semibold tabular">{value}</dd>
    </div>
  )
}

export function AirQualityView() {
  const control = useCanControl()
  const command = useCommand()
  const confirm = useConfirmSwitch()
  const { data: devices, isLoading } = useDevices()
  const { data: rooms = [] } = useRooms()

  const list = devices ?? []

  const aqDevices = useMemo(
    () => list.filter((d) => d.device_type === 'air_purifier' || d.state.air_quality_pm25 != null),
    [list],
  )
  const purifiers = useMemo(
    () => aqDevices.filter((d) => d.device_type === 'air_purifier'),
    [aqDevices],
  )

  const pmReadings = aqDevices
    .filter((d) => d.is_online && d.state.air_quality_pm25 != null)
    .map((d) => d.state.air_quality_pm25!)

  const maxPm = pmReadings.length > 0 ? Math.max(...pmReadings) : undefined
  const aq = airQuality(maxPm)

  const runningCount = purifiers.filter((d) => d.is_online && d.state.is_on).length

  // Filter life average
  const filters = purifiers
    .map((d) => d.state.filter_life)
    .filter((v): v is number => v != null)
  const avgFilter = filters.length > 0 ? Math.round(filters.reduce((a, b) => a + b, 0) / filters.length) : undefined

  // Climate readings from purifiers or sensors
  const temps = aqDevices.map((d) => d.state.temperature).filter((v): v is number => v != null)
  const hums = aqDevices.map((d) => d.state.humidity).filter((v): v is number => v != null)
  const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : undefined
  const avgHum = hums.length > 0 ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : undefined

  if (isLoading) return <Skeleton className="h-64" />

  if (aqDevices.length === 0) {
    return (
      <>
        <PageHeader title={t('nav.airQuality')} description={t('air.emptySubtitle')} />
        <Card className="p-8">
          <EmptyState
            icon={<Wind size={32} />}
            title={t('air.empty.title')}
            message={t('air.empty.message')}
          />
        </Card>
      </>
    )
  }

  return (
    <>
      {confirm.dialog}
      <PageHeader
        title={t('nav.airQuality')}
        description={t('air.subtitle')}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label={t('air.pm25Level')}
          live
          value={
            maxPm != null ? (
              <span>
                {formatNumber(maxPm, 0)}{' '}
                <span className="text-title font-normal text-muted">µg/m³</span>
              </span>
            ) : (
              '—'
            )
          }
          sub={aq?.label ? t('air.statusLabel', { label: aq.label }) : t('air.noSensorData')}
        />

        <Metric
          label={t('air.purifiers')}
          value={`${runningCount}`}
          sub={t('air.totalPurifiers', { count: purifiers.length })}
        />

        <Metric
          label={t('insights.hepa')}
          value={avgFilter != null ? `${avgFilter}%` : '—'}
          sub={avgFilter != null ? (avgFilter < 15 ? t('air.filterReplace') : t('air.filterHealthy')) : t('air.noFilterSensor')}
        />

        <Metric
          label={t('air.environment')}
          value={avgTemp != null ? `${formatNumber(avgTemp)} °C` : '—'}
          sub={avgHum != null ? t('overview.humidity', { value: avgHum }) : t('overview.sensorsOnline')}
        />
      </div>

      <Trend />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Purifier controls */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Wind size={16} className="text-muted" />
                  <span>{t('air.airPurifiers')}</span>
                </span>
              }
              action={
                <Badge tone={runningCount > 0 ? 'on' : 'neutral'}>
                  {runningCount > 0 ? t('air.runningCount', { count: runningCount }) : t('air.allStandby')}
                </Badge>
              }
            />

            <div className="divide-y divide-border">
              {purifiers.map((d) => {
                const s = d.state
                const room = rooms.find((r) => r.id === d.room_id)
                const modes = s.options?.mode
                const fan = s.options?.fan_speed
                const filterLife = s.filter_life
                const devPm = s.air_quality_pm25
                const devAq = airQuality(devPm)

                return (
                  <div key={d.id} className="p-4 md:p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-title font-medium">{d.name}</h3>
                          <Badge tone={d.is_online ? 'on' : 'danger'}>
                            {d.is_online ? t('device.online') : t('device.offline')}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-label text-muted">
                          {room ? `${room.name} · ` : ''}
                          {d.is_online ? (s.is_on ? t('device.active') : t('device.standby')) : t('air.disconnected')}
                        </p>
                      </div>

                      <Switch
                        checked={Boolean(s.is_on && d.is_online)}
                        disabled={!control || !d.can_control || !d.is_online}
                        label={t('deviceRow.power', { name: d.name })}
                        onChange={(v) => confirm.ask([d], v, () => command.mutate({ id: d.id, cmd: { is_on: v } }))}
                      />
                    </div>

                    {/* Sensor snapshot */}
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-raised/40 p-3 sm:grid-cols-4">
                      <div>
                        <span className="text-caption text-muted">{t('reading.pm25')}</span>
                        <p className="mt-0.5 text-body font-semibold tabular">
                          {devPm != null ? `${formatNumber(devPm, 0)} µg/m³` : '—'}
                          {devAq?.label && <span className="ms-1 text-caption text-muted">({devAq.label})</span>}
                        </p>
                      </div>
                      <div>
                        <span className="text-caption text-muted">{t('reading.temperature')}</span>
                        <p className="mt-0.5 text-body font-semibold tabular">
                          {s.temperature != null ? `${formatNumber(s.temperature)} °C` : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-caption text-muted">{t('reading.humidity')}</span>
                        <p className="mt-0.5 text-body font-semibold tabular">
                          {s.humidity != null ? `${formatNumber(s.humidity, 0)}%` : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-caption text-muted">{t('air.filter')}</span>
                        <p className="mt-0.5 text-body font-semibold tabular">
                          {filterLife != null ? `${filterLife}%` : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Mode selector */}
                    {modes && modes.length > 0 && (
                      <div className="border-t border-border pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-body text-muted">{t('air.operatingMode')}</span>
                          <Segmented
                            size="sm"
                            label={t('insights.modeOf', { name: d.name })}
                            value={s.mode}
                            options={modes.map((m) => ({ value: m, label: m }))}
                            onChange={(v) =>
                              control && d.can_control && command.mutate({ id: d.id, cmd: { mode: v } })
                            }
                          />
                        </div>
                        <FanSpeedSlider device={d} disabled={!control || !d.can_control || !d.is_online} className="pt-3" />
                      </div>
                    )}

                    {/* Fan speed selector */}
                    {fan && fan.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                        <span className="text-body text-muted">{t('insights.fanSpeed')}</span>
                        <Segmented
                          size="sm"
                          label={t('insights.fanSpeedOf', { name: d.name })}
                          value={s.fan_speed}
                          options={fan.map((f) => ({ value: f, label: f }))}
                          onChange={(v) =>
                            control && d.can_control && command.mutate({ id: d.id, cmd: { fan_speed: v } })
                          }
                        />
                      </div>
                    )}

                    {/* Filter life progress */}
                    {filterLife != null && (
                      <div className="border-t border-border pt-3">
                        <div className="mb-1.5 flex justify-between text-label">
                          <span className="text-muted">{t('air.hepaHealth')}</span>
                          <span className="tabular font-medium">{t('air.filterRemaining', { percent: filterLife })}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                          <div
                            className={cn(
                              'h-full rounded-full transition-[width]',
                              filterLife < 10
                                ? 'bg-danger'
                                : filterLife < 25
                                ? 'bg-warn'
                                : 'bg-on',
                            )}
                            style={{ width: `${Math.min(Math.max(filterLife, 0), 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Right sidebar: Standards & breakdown */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-muted" />
                  <span>{t('air.whoScale')}</span>
                </span>
              }
            />
            <div className="p-4 space-y-4">
              <div className="space-y-2 text-label">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-on/60" />
                    <span dir="ltr">0 – 12 µg/m³</span>
                  </span>
                  <span className="text-on font-medium">{t('air.excellent')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-on" />
                    <span dir="ltr">13 – 35 µg/m³</span>
                  </span>
                  <span className="text-on font-medium">{t('air.good')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    <span dir="ltr">36 – 55 µg/m³</span>
                  </span>
                  <span className="text-warn font-medium">{t('air.moderate')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-danger" />
                    <span dir="ltr">&gt; 55 µg/m³</span>
                  </span>
                  <span className="text-danger font-medium">{t('air.poor')}</span>
                </div>
              </div>

              <div className="border-t border-border pt-3 text-caption text-muted">
                {t('air.pm25Explain')}
              </div>
            </div>
          </Card>

          {/* Sensors list */}
          <Card>
            <CardHeader title={t('air.sensorsByRoom')} />
            <div className="divide-y divide-border">
              {aqDevices.map((d) => {
                const room = rooms.find((r) => r.id === d.room_id)
                const pm = d.state.air_quality_pm25
                const devAq = airQuality(pm)

                return (
                  <div key={d.id} className="flex items-center justify-between px-4 py-3 text-label">
                    <div>
                      <p className="font-medium text-fg">{d.name}</p>
                      <p className="text-caption text-muted">{room ? room.name : t('devices.unassigned')}</p>
                    </div>
                    <div className="text-end">
                      <p className="font-semibold tabular text-fg">
                        {pm != null ? `${formatNumber(pm, 0)} µg/m³` : '—'}
                      </p>
                      {devAq && (
                        <p className={cn('text-caption', devAq.tone)}>
                          {devAq.label}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

