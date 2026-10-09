import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wind, Lightning, Thermometer, DropHalf } from '@phosphor-icons/react'
import { Card, CardHeader, Badge } from '@/components/ui/Card'
import { Segmented, Switch } from '@/components/ui/Controls'
import { EnergyChart } from '@/components/devices/EnergyChart'
import { airQuality, formatMoney, formatNumber, formatWatts } from '@/lib/format'
import { useCanControl } from '@/lib/auth'
import { useCommand } from '@/lib/queries'
import { cn } from '@/lib/cn'
import type { Device, EnergyOverview, EnergyPoint, Room } from '@/lib/types'

type InsightTab = 'energy' | 'air_quality' | 'climate'

interface OverviewInsightsProps {
  devices: Device[]
  energy: EnergyOverview | undefined
  historyPoints: EnergyPoint[]
  currency: string
  climate: {
    pm25?: number
    temp?: number
    humidity?: number
  }
  rooms: Room[]
  onOpenDevice: (id: string) => void
}

export function OverviewInsights({
  devices,
  energy,
  historyPoints,
  currency,
  climate,
  rooms,
  onOpenDevice,
}: OverviewInsightsProps) {
  const control = useCanControl()
  const command = useCommand()

  // Capability checks: only show tabs if relevant devices actually exist
  const hasPowerDevices = devices.some(
    (d) => d.state.current_power_watts != null || d.state.today_energy_kwh != null,
  )
  const hasEnergyRecords =
    Boolean(energy?.devices && energy.devices.length > 0) ||
    Boolean(energy?.cycle_kwh && energy.cycle_kwh > 0)
  const hasEnergy = hasPowerDevices || hasEnergyRecords

  const aqDevices = devices.filter(
    (d) => d.device_type === 'air_purifier' || d.state.air_quality_pm25 != null,
  )
  const hasAirQuality = aqDevices.length > 0

  const climateDevices = devices.filter(
    (d) =>
      (d.state.temperature != null || d.state.humidity != null) &&
      d.device_type !== 'air_purifier',
  )
  const hasClimate = climateDevices.length > 0

  // If no properly supported device exists for any category, hide this section entirely
  if (!hasEnergy && !hasAirQuality && !hasClimate) {
    return null
  }

  const availableTabs: { id: InsightTab; label: string }[] = []
  if (hasEnergy) availableTabs.push({ id: 'energy', label: 'Energy' })
  if (hasAirQuality) availableTabs.push({ id: 'air_quality', label: 'Air quality' })
  if (hasClimate) availableTabs.push({ id: 'climate', label: 'Climate' })

  const [activeTab, setActiveTab] = useState<InsightTab>(availableTabs[0].id)
  const currentTab = availableTabs.some((t) => t.id === activeTab)
    ? activeTab
    : availableTabs[0].id

  const aq = airQuality(climate.pm25)

  return (
    <Card>
      <CardHeader
        className="gap-2 py-2"
        title={
          availableTabs.length > 1 ? (
            <Segmented<InsightTab>
              size="sm"
              label="Insights view"
              value={currentTab}
              onChange={setActiveTab}
              options={availableTabs.map((t) => ({ value: t.id, label: t.label }))}
            />
          ) : (
            <span className="flex items-center gap-1.5">
              {currentTab === 'energy' && <Lightning size={16} className="text-muted" />}
              {currentTab === 'air_quality' && <Wind size={16} className="text-muted" />}
              {currentTab === 'climate' && <Thermometer size={16} className="text-muted" />}
              {availableTabs[0].label}
            </span>
          )
        }
        action={
          currentTab === 'energy' ? (
            <Link to="/energy" className="text-label text-muted hover:text-fg">
              Details
            </Link>
          ) : currentTab === 'air_quality' && climate.pm25 != null ? (
            <Badge tone={aq?.tone === 'text-danger' ? 'danger' : aq?.tone === 'text-warn' ? 'warn' : 'on'}>
              PM2.5 {aq?.label}
            </Badge>
          ) : null
        }
      />

      <div className="p-4">
        {/* --- ENERGY TAB --- */}
        {currentTab === 'energy' && (
          <div className="space-y-4">
            <EnergyChart points={historyPoints} range="day" currency={currency} height={110} />

            {energy?.settings.monthly_budget ? (
              <div className="border-t border-border pt-4">
                <div className="mb-1.5 flex justify-between text-label">
                  <span className="text-muted">Monthly budget</span>
                  <span className="tabular">
                    {formatMoney(energy.cycle_cost, currency)} /{' '}
                    {formatMoney(energy.settings.monthly_budget, currency)}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-raised"
                  role="progressbar"
                  aria-label="Budget used"
                  aria-valuenow={Math.round(energy.budget_used_percent ?? 0)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-slow',
                      (energy.budget_used_percent ?? 0) > 90 ? 'bg-danger' : 'bg-fg',
                    )}
                    style={{ width: `${Math.min(energy.budget_used_percent ?? 0, 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            {/* Active high-draw devices list */}
            {devices.some((d) => (d.state.current_power_watts ?? 0) > 0) && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-caption font-medium uppercase tracking-wider text-muted">
                  Drawing power now
                </p>
                <div className="space-y-1.5">
                  {devices
                    .filter((d) => d.is_online && (d.state.current_power_watts ?? 0) > 0)
                    .sort((a, b) => (b.state.current_power_watts ?? 0) - (a.state.current_power_watts ?? 0))
                    .slice(0, 3)
                    .map((d) => {
                      const roomName = rooms.find((r) => r.id === d.room_id)?.name
                      return (
                        <div
                          key={d.id}
                          onClick={() => onOpenDevice(d.id)}
                          className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-label transition-colors hover:bg-raised"
                        >
                          <span className="truncate">
                            {d.name}
                            {roomName && <span className="ml-1.5 text-caption text-muted">· {roomName}</span>}
                          </span>
                          <span className="tabular text-muted">
                            {formatWatts(d.state.current_power_watts)}
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- AIR QUALITY TAB --- */}
        {currentTab === 'air_quality' && (
          <div className="space-y-5">
            {/* PM2.5 Gauge & Visual Spectrum Bar */}
            {climate.pm25 != null && (
              <div className="rounded-lg border border-border bg-raised/40 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span className="text-metric font-semibold tabular">
                      {formatNumber(climate.pm25, 0)}
                    </span>
                    <span className="ml-1.5 text-body text-muted">µg/m³</span>
                  </div>
                  <Badge tone={aq?.tone === 'text-danger' ? 'danger' : aq?.tone === 'text-warn' ? 'warn' : 'on'}>
                    {aq?.label}
                  </Badge>
                </div>

                {/* 4-segment WHO PM2.5 scale bar */}
                <div className="mt-3">
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-raised flex">
                    <div className="h-full w-1/4 bg-on/40" title="0-12 Excellent" />
                    <div className="h-full w-1/4 bg-on" title="13-35 Good" />
                    <div className="h-full w-1/4 bg-warn" title="36-55 Moderate" />
                    <div className="h-full w-1/4 bg-danger" title="55+ Poor" />
                  </div>
                  {/* Position marker */}
                  <div className="relative mt-1 h-3">
                    <div
                      className="absolute -top-3.5 -ml-1 h-4 w-2 rounded-full border border-bg bg-fg shadow-sm transition-[left] duration-base"
                      style={{
                        left: `${Math.min(Math.max(((climate.pm25) / 70) * 100, 2), 98)}%`,
                      }}
                    />
                    <div className="flex justify-between text-[11px] text-subtle tabular">
                      <span>0</span>
                      <span>12</span>
                      <span>35</span>
                      <span>55+ µg/m³</span>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-caption text-subtle">
                  WHO 24h standard: ≤ 15 µg/m³ · Clean indoor air
                </p>
              </div>
            )}

            {/* Air Purifier Devices Control Cards */}
            {aqDevices
              .filter((d) => d.device_type === 'air_purifier')
              .map((d) => {
                const s = d.state
                const room = rooms.find((r) => r.id === d.room_id)
                const modes = s.options?.mode
                const fan = s.options?.fan_speed
                const filterLife = s.filter_life

                return (
                  <div
                    key={d.id}
                    className="rounded-lg border border-border bg-panel p-3.5 space-y-3"
                  >
                    {/* Purifier Header & Power */}
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className="min-w-0 cursor-pointer flex-1"
                        onClick={() => onOpenDevice(d.id)}
                      >
                        <p className="truncate text-body font-medium hover:text-muted">
                          {d.name}
                        </p>
                        <p className="text-caption text-muted">
                          {room ? `${room.name} · ` : ''}
                          {d.is_online ? (s.is_on ? 'Running' : 'Standby') : 'Offline'}
                        </p>
                      </div>
                      <Switch
                        checked={Boolean(s.is_on && d.is_online)}
                        disabled={!control || !d.is_online}
                        label={`${d.name} power`}
                        onChange={(v) =>
                          command.mutate({ id: d.id, cmd: { is_on: v } })
                        }
                      />
                    </div>

                    {/* Mode selector */}
                    {modes && modes.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-caption text-muted">Mode</span>
                        <Segmented
                          size="sm"
                          label={`${d.name} mode`}
                          value={s.mode}
                          options={modes.map((m) => ({ value: m, label: m }))}
                          onChange={(v) =>
                            control && command.mutate({ id: d.id, cmd: { mode: v } })
                          }
                        />
                      </div>
                    )}

                    {/* Fan speed selector */}
                    {fan && fan.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-caption text-muted">Fan speed</span>
                        <Segmented
                          size="sm"
                          label={`${d.name} fan speed`}
                          value={s.fan_speed}
                          options={fan.map((f) => ({ value: f, label: f }))}
                          onChange={(v) =>
                            control && command.mutate({ id: d.id, cmd: { fan_speed: v } })
                          }
                        />
                      </div>
                    )}

                    {/* Filter life indicator */}
                    {filterLife != null && (
                      <div className="border-t border-border pt-2 text-label">
                        <div className="flex justify-between text-caption mb-1">
                          <span className="text-muted">HEPA filter</span>
                          <span className="tabular font-medium">
                            {formatNumber(filterLife, 0)}% remaining
                          </span>
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

            {/* Room air quality breakdown if multiple sensors */}
            {aqDevices.length > 1 && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-caption font-medium uppercase tracking-wider text-muted">
                  Readings by device
                </p>
                <div className="space-y-1.5">
                  {aqDevices.map((d) => {
                    const pm = d.state.air_quality_pm25
                    const roomName = rooms.find((r) => r.id === d.room_id)?.name
                    return (
                      <div
                        key={d.id}
                        onClick={() => onOpenDevice(d.id)}
                        className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-label transition-colors hover:bg-raised"
                      >
                        <span className="truncate">
                          {d.name}
                          {roomName && <span className="ml-1.5 text-caption text-muted">· {roomName}</span>}
                        </span>
                        <span className="tabular text-muted">
                          {pm != null ? `${formatNumber(pm, 0)} µg/m³` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- CLIMATE TAB --- */}
        {currentTab === 'climate' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-raised/40 p-3">
                <span className="flex items-center gap-1 text-caption text-muted">
                  <Thermometer size={14} /> Temperature
                </span>
                <p className="mt-1 text-title font-semibold tabular">
                  {climate.temp != null ? `${formatNumber(climate.temp)} °C` : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-raised/40 p-3">
                <span className="flex items-center gap-1 text-caption text-muted">
                  <DropHalf size={14} /> Humidity
                </span>
                <p className="mt-1 text-title font-semibold tabular">
                  {climate.humidity != null ? `${formatNumber(climate.humidity, 0)} %` : '—'}
                </p>
              </div>
            </div>

            {/* Climate sensors list */}
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-caption font-medium uppercase tracking-wider text-muted">
                Sensors
              </p>
              <div className="space-y-1.5">
                {climateDevices.map((d) => {
                  const s = d.state
                  const roomName = rooms.find((r) => r.id === d.room_id)?.name
                  return (
                    <div
                      key={d.id}
                      onClick={() => onOpenDevice(d.id)}
                      className="flex cursor-pointer items-center justify-between rounded px-1.5 py-1 text-label transition-colors hover:bg-raised"
                    >
                      <span className="truncate">
                        {d.name}
                        {roomName && <span className="ml-1.5 text-caption text-muted">· {roomName}</span>}
                      </span>
                      <span className="tabular text-muted">
                        {[
                          s.temperature != null ? `${formatNumber(s.temperature)} °C` : null,
                          s.humidity != null ? `${formatNumber(s.humidity, 0)}%` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
