import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlugsConnected } from '@phosphor-icons/react'
import { Card, CardHeader, EmptyState, Metric, Notice, PageHeader, Skeleton } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Switch, Segmented } from '@/components/ui/Controls'
import { DeviceRow } from '@/components/devices/DeviceRow'
import { DeviceDrawer } from '@/components/devices/DeviceDrawer'
import { OverviewInsights } from './OverviewInsights'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useDiscovered, useEnergy, useGroups, useRooms, useScenes } from '@/lib/queries'
import { airQuality, formatKwh, formatMoney, formatNumber, formatWatts } from '@/lib/format'
import { errorMessage, useToast } from '@/lib/toast'
import { cn } from '@/lib/cn'
import type { Device, Group, Scene } from '@/lib/types'

type CategoryFilter = 'all' | 'power' | 'lights' | 'air' | 'climate'

export function OverviewView() {
  const admin = useIsAdmin()
  const control = useCanControl()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: devices, isLoading } = useDevices()
  const { data: rooms = [] } = useRooms()
  const { data: groups = [] } = useGroups()
  const { data: energy } = useEnergy()
  const { data: scenes = [] } = useScenes()
  const { data: pending = [] } = useDiscovered('pending')
  const history = useQuery({ queryKey: keys.energyHistory('day'), queryFn: () => api.energyHistory('day'), refetchInterval: 60_000 })
  const [room, setRoom] = useState('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [quickTab, setQuickTab] = useState<'scenes' | 'groups'>('scenes')
  const [open, setOpen] = useState<string | null>(null)

  const runScene = useMutation({
    mutationFn: (id: string) => api.activateScene(id),
    onSuccess: (r, id) => {
      qc.invalidateQueries({ queryKey: keys.scenes })
      qc.invalidateQueries({ queryKey: keys.devices })
      const name = scenes.find((s) => s.id === id)?.name
      toast.push(r.success ? { tone: 'success', title: `${name} applied` } : { tone: 'warning', title: `${name} partly applied`, message: r.errors.join('; ') })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Scene failed', message: errorMessage(e) }),
  })

  const toggleScene = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.toggleScene(id, on),
    onSuccess: (r, { id, on }) => {
      qc.invalidateQueries({ queryKey: keys.scenes })
      qc.invalidateQueries({ queryKey: keys.devices })
      const name = scenes.find((s) => s.id === id)?.name ?? 'Scene'
      toast.push(
        r.success
          ? { tone: 'success', title: `${name} switched ${on ? 'on' : 'off'}` }
          : { tone: 'warning', title: `${name} partly applied`, message: r.errors.join('; ') },
      )
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Scene toggle failed', message: errorMessage(e) }),
  })

  const toggleGroup = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.groupCommand(id, { is_on: on }),
    onSuccess: (_r, { id, on }) => {
      qc.invalidateQueries({ queryKey: keys.devices })
      const name = groups.find((g) => g.id === id)?.name ?? 'Group'
      toast.push({ tone: 'success', title: `${name} turned ${on ? 'on' : 'off'}` })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Group toggle failed', message: errorMessage(e) }),
  })

  const list = devices ?? []
  const climate = useMemo(() => summarizeClimate(list), [list])
  const currency = energy?.settings.currency ?? 'USD'
  const controllable = list.filter((d) => d.device_type !== 'sensor')
  const onCount = controllable.filter((d) => d.is_online && d.state.is_on).length
  // From the live device list (WebSocket), not the energy query, so it moves as devices report.
  const watts = list.reduce((sum, d) => sum + (d.is_online ? d.state.current_power_watts ?? 0 : 0), 0)
  const offline = list.filter((d) => !d.is_online).length
  const aq = airQuality(climate.pm25)
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  // Device categories detection
  const powerDevices = useMemo(
    () =>
      list.filter(
        (d) =>
          ['switch', 'plug'].includes(d.device_type) ||
          d.state.current_power_watts != null ||
          d.state.today_energy_kwh != null,
      ),
    [list],
  )
  const lightDevices = useMemo(
    () =>
      list.filter(
        (d) =>
          d.device_type === 'light' ||
          d.state.brightness != null ||
          d.state.color != null ||
          d.state.color_temp != null,
      ),
    [list],
  )
  const aqDevices = useMemo(
    () =>
      list.filter(
        (d) => d.device_type === 'air_purifier' || d.state.air_quality_pm25 != null,
      ),
    [list],
  )
  const climateDevices = useMemo(
    () =>
      list.filter(
        (d) =>
          (d.state.temperature != null ||
            d.state.humidity != null ||
            d.device_type === 'sensor' ||
            d.device_type === 'climate') &&
          d.device_type !== 'air_purifier',
      ),
    [list],
  )

  // Capability checks: only show metrics & insights when corresponding devices exist
  const hasPowerMeasurements = list.some(
    (d) => d.state.current_power_watts != null || d.state.today_energy_kwh != null,
  )
  const hasEnergyRecords =
    Boolean(energy?.devices && energy.devices.length > 0) ||
    Boolean(energy?.cycle_kwh && energy.cycle_kwh > 0)
  const showEnergy = hasPowerMeasurements || hasEnergyRecords

  const showAirQuality = aqDevices.length > 0
  const showClimate = climateDevices.length > 0
  const hasInsights = showEnergy || showAirQuality || showClimate

  // Categories list for filtering
  const categories = useMemo(() => {
    const cats: { id: CategoryFilter; label: string; count: number }[] = [
      { id: 'all', label: 'All', count: list.length },
    ]
    if (powerDevices.length > 0) {
      cats.push({ id: 'power', label: 'Power', count: powerDevices.length })
    }
    if (lightDevices.length > 0) {
      cats.push({ id: 'lights', label: 'Lights', count: lightDevices.length })
    }
    if (aqDevices.length > 0) {
      cats.push({ id: 'air', label: 'Air quality', count: aqDevices.length })
    }
    if (climateDevices.length > 0) {
      cats.push({ id: 'climate', label: 'Climate', count: climateDevices.length })
    }
    return cats
  }, [list.length, powerDevices.length, lightDevices.length, aqDevices.length, climateDevices.length])

  // Filter devices by room AND category
  const roomFiltered = room === 'all' ? list : list.filter((d) => (room === 'none' ? !d.room_id : d.room_id === room))
  const shown = useMemo(() => {
    return roomFiltered.filter((d) => {
      if (category === 'power') return powerDevices.some((p) => p.id === d.id)
      if (category === 'lights') return lightDevices.some((l) => l.id === d.id)
      if (category === 'air') return aqDevices.some((a) => a.id === d.id)
      if (category === 'climate') return climateDevices.some((c) => c.id === d.id)
      return true
    })
  }, [roomFiltered, category, powerDevices, lightDevices, aqDevices, climateDevices])

  // Dynamically assemble metrics based on added device capabilities
  const metricCards: React.ReactNode[] = []

  if (showEnergy) {
    metricCards.push(
      <Metric
        key="power"
        label="Power now"
        live
        value={formatWatts(watts)}
        sub={`${onCount} of ${controllable.length} devices on`}
      />,
    )
    metricCards.push(
      <Metric
        key="today"
        label="Today"
        value={formatKwh(energy?.today_kwh ?? 0)}
        sub={formatMoney(energy?.today_cost ?? 0, currency)}
      />,
    )
    metricCards.push(
      <Metric
        key="bill"
        label="Bill this cycle"
        value={formatMoney(energy?.cycle_cost ?? 0, currency)}
        sub={`Projected ${formatMoney(energy?.projected_cost ?? 0, currency)}`}
      />,
    )
  } else if (controllable.length > 0) {
    metricCards.push(
      <Metric
        key="devices-active"
        label="Active devices"
        live={onCount > 0}
        value={`${onCount}`}
        sub={`${controllable.length} devices connected`}
      />,
    )
    if (lightDevices.length > 0) {
      const lightsOn = lightDevices.filter((d) => d.is_online && d.state.is_on).length
      metricCards.push(
        <Metric
          key="lights-active"
          label="Lights on"
          value={`${lightsOn}`}
          sub={`${lightDevices.length} lighting devices`}
        />,
      )
    }
  }

  if (showAirQuality && climate.pm25 != null) {
    metricCards.push(
      <Metric
        key="air-quality"
        label="Air quality"
        value={
          <span>
            {formatNumber(climate.pm25, 0)}{' '}
            <span className="text-title font-normal text-muted">µg/m³</span>
          </span>
        }
        sub={`PM2.5 · ${aq?.label}`}
      />,
    )
  } else if (showClimate && climate.temp != null) {
    metricCards.push(
      <Metric
        key="climate"
        label="Climate"
        value={`${formatNumber(climate.temp)} °C`}
        sub={climate.humidity != null ? `${formatNumber(climate.humidity, 0)} % humidity` : 'Sensors online'}
      />,
    )
  }

  const metricGridCols =
    metricCards.length >= 4
      ? 'grid-cols-2 lg:grid-cols-4'
      : metricCards.length === 3
      ? 'grid-cols-1 sm:grid-cols-3'
      : metricCards.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-1'

  return (
    <>
      <PageHeader title="Overview" description={date} />

      {admin && pending.length > 0 && (
        <div className="mb-6">
          <Notice action={<Button size="sm" onClick={() => navigate('/devices?tab=discovered')}>Review</Button>}>
            <span className="font-medium">{pending.length} new {pending.length === 1 ? 'device' : 'devices'} found</span>
            <span className="text-muted"> — {pending.map((p) => p.name).join(', ')}</span>
          </Notice>
        </div>
      )}

      {metricCards.length > 0 && (
        <div className={cn('grid gap-3', metricGridCols)}>
          {metricCards}
        </div>
      )}

      <div className={cn('mt-6 grid gap-6', hasInsights || scenes.length > 0 ? 'lg:grid-cols-3' : 'grid-cols-1')}>
        <Card className={hasInsights || scenes.length > 0 ? 'lg:col-span-2' : 'col-span-1'}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span>Devices</span>
                {offline > 0 && <span className="text-caption text-danger">({offline} offline)</span>}
              </span>
            }
            action={
              rooms.length > 0 && (
                <select
                  aria-label="Filter by room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="h-8 cursor-pointer rounded-md border border-border bg-raised px-2 text-label text-fg focus:outline-none"
                >
                  <option value="all">All rooms</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  <option value="none">Unassigned</option>
                </select>
              )
            }
          />

          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5">
              {categories.map((c) => {
                const active = category === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={cn(
                      'flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-label font-medium transition-colors',
                      active
                        ? 'bg-raised text-fg shadow-[0_0_0_1px_rgb(var(--border-strong))]'
                        : 'text-muted hover:bg-raised/60 hover:text-fg',
                    )}
                  >
                    <span>{c.label}</span>
                    <span className={cn('text-caption tabular', active ? 'text-fg' : 'text-subtle')}>
                      {c.count}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<PlugsConnected size={28} />}
                title="No devices yet"
                message={admin ? 'Connect Tuya, Tapo or Xiaomi under Integrations. Devices on your network are discovered automatically.' : 'An administrator has not shared any devices with you yet.'}
                action={admin && <Button variant="primary" onClick={() => navigate('/plugins')}>Open integrations</Button>}
              />
            </div>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center text-muted">No devices match the selected filter.</p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((d) => (
                <DeviceRow key={d.id} device={d} room={room === 'all' ? rooms.find((r) => r.id === d.room_id) : undefined} onOpen={() => setOpen(d.id)} />
              ))}
            </ul>
          )}
        </Card>

        {(hasInsights || scenes.length > 0 || groups.length > 0) && (
          <div className="flex flex-col gap-6">
            {hasInsights && (
              <OverviewInsights
                devices={list}
                energy={energy}
                historyPoints={history.data ?? []}
                currency={currency}
                climate={climate}
                rooms={rooms}
                onOpenDevice={(id) => setOpen(id)}
              />
            )}

            <Card>
              <CardHeader
                title={quickTab === 'scenes' ? 'Scenes' : 'Device groups'}
                action={
                  <div className="flex items-center gap-2">
                    {groups.length > 0 && scenes.length > 0 && (
                      <Segmented
                        label="Quick control view"
                        value={quickTab}
                        onChange={(v) => setQuickTab(v as 'scenes' | 'groups')}
                        options={[
                          { value: 'scenes', label: `Scenes (${scenes.length})` },
                          { value: 'groups', label: `Groups (${groups.length})` },
                        ]}
                      />
                    )}
                    <Link
                      to={quickTab === 'scenes' ? '/automations' : '/devices'}
                      className="text-label text-muted hover:text-fg"
                    >
                      Manage
                    </Link>
                  </div>
                }
              />

              {quickTab === 'scenes' ? (
                scenes.length === 0 ? (
                  <p className="px-4 py-6 text-label text-muted">
                    No scenes. Create one under Automations.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {scenes.map((s) => {
                      const active = isSceneActive(s, list, groups)
                      const targetCount = getSceneTargetCount(s, groups)
                      return (
                        <li key={s.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-medium">{s.name}</p>
                            <p className="text-caption text-muted">
                              {targetCount > 0 ? `${targetCount} device${targetCount === 1 ? '' : 's'}` : 'Actions'}
                              {active && ' · currently active'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={active}
                              disabled={!control || (toggleScene.isPending && toggleScene.variables?.id === s.id)}
                              label={`Toggle ${s.name}`}
                              onChange={(on) => toggleScene.mutate({ id: s.id, on })}
                            />
                            <Button
                              size="sm"
                              disabled={!control}
                              loading={runScene.isPending && runScene.variables === s.id}
                              onClick={() => runScene.mutate(s.id)}
                            >
                              Run
                            </Button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : groups.length === 0 ? (
                <p className="px-4 py-6 text-label text-muted">
                  No groups. Create a group on the Devices page.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {groups.map((g) => {
                    const memberDevices = list.filter((d) => g.device_ids.includes(d.id))
                    const onCount = memberDevices.filter((d) => d.is_online && d.state.is_on).length
                    const isGroupOn = onCount > 0
                    return (
                      <li key={g.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body font-medium">{g.name}</p>
                          <p className="text-caption text-muted">
                            {memberDevices.length} devices ·{' '}
                            {onCount === 0 ? 'All off' : `${onCount} on`}
                          </p>
                        </div>
                        <Switch
                          checked={isGroupOn}
                          disabled={!control || (toggleGroup.isPending && toggleGroup.variables?.id === g.id)}
                          label={`Toggle ${g.name}`}
                          onChange={(on) => toggleGroup.mutate({ id: g.id, on })}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>

      <DeviceDrawer device={list.find((d) => d.id === open) ?? null} onClose={() => setOpen(null)} />
    </>
  )
}

function summarizeClimate(devices: Device[]) {
  const online = devices.filter((d) => d.is_online)
  const nums = (k: 'air_quality_pm25' | 'temperature' | 'humidity') => online.map((d) => d.state[k]).filter((v): v is number => v != null)
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : undefined)
  const pms = nums('air_quality_pm25')
  return { pm25: pms.length ? Math.max(...pms) : undefined, temp: avg(nums('temperature')), humidity: avg(nums('humidity')) }
}

function isSceneActive(scene: Scene, devices: Device[], groups: Group[]): boolean {
  const targetIds = new Set<string>()
  for (const action of scene.actions) {
    if (action.type === 'device_command' && action.device_id) {
      targetIds.add(action.device_id)
    } else if (action.type === 'group_command' && action.group_id) {
      const g = groups.find((grp) => grp.id === action.group_id)
      g?.device_ids.forEach((id) => targetIds.add(id))
    }
  }
  if (targetIds.size > 0) {
    const memberDevices = devices.filter((d) => targetIds.has(d.id))
    return memberDevices.some((d) => d.is_online && d.state.is_on)
  }
  return scene.is_active
}

function getSceneTargetCount(scene: Scene, groups: Group[]): number {
  const targetIds = new Set<string>()
  for (const action of scene.actions) {
    if (action.type === 'device_command' && action.device_id) {
      targetIds.add(action.device_id)
    } else if (action.type === 'group_command' && action.group_id) {
      const g = groups.find((grp) => grp.id === action.group_id)
      g?.device_ids.forEach((id) => targetIds.add(id))
    }
  }
  return targetIds.size
}
