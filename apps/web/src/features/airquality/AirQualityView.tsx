import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wind, ShieldCheck } from '@phosphor-icons/react'
import { Card, CardHeader, Metric, PageHeader, Badge, Skeleton, EmptyState } from '@/components/ui/Card'
import { Segmented, Switch } from '@/components/ui/Controls'
import { useCanControl } from '@/lib/auth'
import { TrendChart } from '@/components/devices/TrendChart'
import { FanSpeedSlider } from '@/components/devices/FanSpeedSlider'
import { api } from '@/lib/api'
import { keys, useCommand, useDevices, useRooms } from '@/lib/queries'
import { airQuality, formatBucket, formatNumber } from '@/lib/format'
import { cn } from '@/lib/cn'

type Range = 'day' | 'week' | 'month'
type Reading = 'pm25' | 'temperature' | 'humidity'
const READINGS: Record<Reading, { label: string; unit: string; digits: number }> = {
  pm25: { label: 'PM2.5', unit: 'µg/m³', digits: 0 },
  temperature: { label: 'Temperature', unit: '°C', digits: 1 },
  humidity: { label: 'Humidity', unit: '%', digits: 0 },
}

/** Recorded history: the chart, and what it says about the period. */
function Trend() {
  const [range, setRange] = useState<Range>('day')
  const [reading, setReading] = useState<Reading>('pm25')
  const { data = [], isLoading } = useQuery({ queryKey: keys.airHistory(range), queryFn: () => api.airHistory(range), refetchInterval: 60_000 })
  // Offer only the readings the home's devices actually report.
  const available = (Object.keys(READINGS) as Reading[]).filter((r) => r === 'pm25' || data.some((p) => p[r] != null))
  const shown = available.includes(reading) ? reading : 'pm25'
  const meta = READINGS[shown]

  const pm = data.flatMap((p) => (p.pm25 == null ? [] : [p]))
  const average = pm.length ? pm.reduce((s, p) => s + p.pm25!, 0) / pm.length : null
  const peak = pm.reduce<(typeof pm)[number] | null>((best, p) => (p.pm25! > (best?.pm25 ?? -1) ? p : best), null)
  const clean = pm.length ? (pm.filter((p) => p.pm25! <= 35).length / pm.length) * 100 : null
  const when = (t: string) => formatBucket(t, range)
  const period = range === 'day' ? '24 h' : range === 'week' ? '7 d' : '30 d'

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Trend"
          action={
            <div className="flex flex-wrap justify-end gap-2">
              {available.length > 1 && (
                <Segmented size="sm" label="Reading" value={shown} onChange={setReading} options={available.map((r) => ({ value: r, label: READINGS[r].label }))} />
              )}
              <Segmented size="sm" label="Range" value={range} onChange={setRange} options={[{ value: 'day', label: '24 hours' }, { value: 'week', label: '7 days' }, { value: 'month', label: '30 days' }]} />
            </div>
          }
        />
        <div className="p-4">
          {isLoading ? (
            <Skeleton className="h-[240px]" />
          ) : (
            <TrendChart
              points={data.map((p) => ({ t: p.t, value: p[shown] }))}
              range={range}
              unit={meta.unit}
              digits={meta.digits}
              marks={shown === 'pm25' ? [{ value: 15, label: 'Clean ≤ 15' }, { value: 35, label: 'Good ≤ 35' }] : []}
              empty="No history yet. Readings are recorded every few minutes while a sensor is online."
              height={200}
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`Last ${period}`} />
        <dl className="divide-y divide-border">
          <TrendFact label="Average PM2.5" value={average != null ? `${formatNumber(average, 0)} µg/m³` : '—'} sub={airQuality(average ?? undefined)?.label ?? 'No readings yet'} />
          <TrendFact label="Peak" value={peak ? `${formatNumber(peak.pm25!, 0)} µg/m³` : '—'} sub={peak ? when(peak.t) : 'No readings yet'} />
          <TrendFact label="Time with good air" value={clean != null ? `${formatNumber(clean, 0)}%` : '—'} sub="PM2.5 at or below 35 µg/m³" />
        </dl>
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
        <PageHeader title="Air Quality" description="Real-time air health and purifier performance" />
        <Card className="p-8">
          <EmptyState
            icon={<Wind size={32} />}
            title="No air quality devices connected"
            message="Add a Xiaomi Air Purifier, Tuya purifier, or environmental PM2.5 monitor under Integrations to enable real-time air analytics and control."
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Air Quality"
        description="Real-time air health, PM2.5 particulate levels & purifier performance"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="PM2.5 Level"
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
          sub={aq?.label ? `Status · ${aq.label}` : 'No sensor data'}
        />

        <Metric
          label="Purifiers"
          value={`${runningCount}`}
          sub={`${purifiers.length} total ${purifiers.length === 1 ? 'purifier' : 'purifiers'}`}
        />

        <Metric
          label="HEPA Filter"
          value={avgFilter != null ? `${avgFilter}%` : '—'}
          sub={avgFilter != null ? (avgFilter < 15 ? 'Replacement suggested' : 'Filter life healthy') : 'No filter sensor'}
        />

        <Metric
          label="Environment"
          value={avgTemp != null ? `${formatNumber(avgTemp)} °C` : '—'}
          sub={avgHum != null ? `${avgHum}% humidity` : 'Sensors online'}
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
                  <span>Air Purifiers</span>
                </span>
              }
              action={
                <Badge tone={runningCount > 0 ? 'on' : 'neutral'}>
                  {runningCount > 0 ? `${runningCount} running` : 'All standby'}
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
                            {d.is_online ? 'Online' : 'Offline'}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-label text-muted">
                          {room ? `${room.name} · ` : ''}
                          {d.is_online ? (s.is_on ? 'Active' : 'Standby') : 'Disconnected'}
                        </p>
                      </div>

                      <Switch
                        checked={Boolean(s.is_on && d.is_online)}
                        disabled={!control || !d.can_control || !d.is_online}
                        label={`${d.name} power`}
                        onChange={(v) =>
                          command.mutate({ id: d.id, cmd: { is_on: v } })
                        }
                      />
                    </div>

                    {/* Sensor snapshot */}
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-raised/40 p-3 sm:grid-cols-4">
                      <div>
                        <span className="text-caption text-muted">PM2.5</span>
                        <p className="mt-0.5 text-body font-semibold tabular">
                          {devPm != null ? `${formatNumber(devPm, 0)} µg/m³` : '—'}
                          {devAq?.label && <span className="ml-1 text-caption text-muted">({devAq.label})</span>}
                        </p>
                      </div>
                      <div>
                        <span className="text-caption text-muted">Temperature</span>
                        <p className="mt-0.5 text-body font-semibold tabular">
                          {s.temperature != null ? `${formatNumber(s.temperature)} °C` : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-caption text-muted">Humidity</span>
                        <p className="mt-0.5 text-body font-semibold tabular">
                          {s.humidity != null ? `${formatNumber(s.humidity, 0)} %` : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-caption text-muted">Filter</span>
                        <p className="mt-0.5 text-body font-semibold tabular">
                          {filterLife != null ? `${filterLife}%` : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Mode selector */}
                    {modes && modes.length > 0 && (
                      <div className="border-t border-border pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-body text-muted">Operating Mode</span>
                          <Segmented
                            size="sm"
                            label={`${d.name} mode`}
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
                        <span className="text-body text-muted">Fan Speed</span>
                        <Segmented
                          size="sm"
                          label={`${d.name} fan speed`}
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
                          <span className="text-muted">HEPA Filter Health</span>
                          <span className="tabular font-medium">{filterLife}% remaining</span>
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
                  <span>WHO Air Quality Scale</span>
                </span>
              }
            />
            <div className="p-4 space-y-4">
              <div className="space-y-2 text-label">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-on/60" />
                    <span>0 – 12 µg/m³</span>
                  </span>
                  <span className="text-on font-medium">Excellent</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-on" />
                    <span>13 – 35 µg/m³</span>
                  </span>
                  <span className="text-on font-medium">Good</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    <span>36 – 55 µg/m³</span>
                  </span>
                  <span className="text-warn font-medium">Moderate</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-danger" />
                    <span>&gt; 55 µg/m³</span>
                  </span>
                  <span className="text-danger font-medium">Poor</span>
                </div>
              </div>

              <div className="border-t border-border pt-3 text-caption text-muted">
                Fine particulate matter (PM2.5) consists of microscopic particles that penetrate deep into the lungs. Clean indoor target: ≤ 15 µg/m³.
              </div>
            </div>
          </Card>

          {/* Sensors list */}
          <Card>
            <CardHeader title="Sensors by Room" />
            <div className="divide-y divide-border">
              {aqDevices.map((d) => {
                const room = rooms.find((r) => r.id === d.room_id)
                const pm = d.state.air_quality_pm25
                const devAq = airQuality(pm)

                return (
                  <div key={d.id} className="flex items-center justify-between px-4 py-3 text-label">
                    <div>
                      <p className="font-medium text-fg">{d.name}</p>
                      <p className="text-caption text-muted">{room ? room.name : 'Unassigned'}</p>
                    </div>
                    <div className="text-right">
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
