import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { PlugsConnected } from '@phosphor-icons/react'
import { Card, CardHeader, EmptyState, Metric, Notice, PageHeader, Skeleton } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DeviceRow } from '@/components/devices/DeviceRow'
import { DeviceDrawer } from '@/components/devices/DeviceDrawer'
import { EnergyChart } from '@/components/devices/EnergyChart'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useDiscovered, useEnergy, useRooms, useScenes } from '@/lib/queries'
import { airQuality, formatKwh, formatMoney, formatNumber, formatWatts } from '@/lib/format'
import { errorMessage, useToast } from '@/lib/toast'
import { cn } from '@/lib/cn'
import type { Device } from '@/lib/types'

export function OverviewView() {
  const admin = useIsAdmin()
  const control = useCanControl()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: devices, isLoading } = useDevices()
  const { data: rooms = [] } = useRooms()
  const { data: energy } = useEnergy()
  const { data: scenes = [] } = useScenes()
  const { data: pending = [] } = useDiscovered('pending')
  const history = useQuery({ queryKey: keys.energyHistory('day'), queryFn: () => api.energyHistory('day'), refetchInterval: 60_000 })
  const [room, setRoom] = useState('all')
  const [open, setOpen] = useState<string | null>(null)

  const runScene = useMutation({
    mutationFn: (id: string) => api.activateScene(id),
    onSuccess: (r, id) => {
      const name = scenes.find((s) => s.id === id)?.name
      toast.push(r.success ? { tone: 'success', title: `${name} applied` } : { tone: 'warning', title: `${name} partly applied`, message: r.errors.join('; ') })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Scene failed', message: errorMessage(e) }),
  })

  const list = devices ?? []
  const shown = room === 'all' ? list : list.filter((d) => (room === 'none' ? !d.room_id : d.room_id === room))
  const climate = useMemo(() => summarizeClimate(list), [list])
  const currency = energy?.settings.currency ?? 'USD'
  const controllable = list.filter((d) => d.device_type !== 'sensor')
  const onCount = controllable.filter((d) => d.is_online && d.state.is_on).length
  const offline = list.filter((d) => !d.is_online).length
  const aq = airQuality(climate.pm25)
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Power now" live value={formatWatts(energy?.current_watts ?? 0)} sub={`${onCount} of ${controllable.length} devices on`} />
        <Metric label="Today" value={formatKwh(energy?.today_kwh ?? 0)} sub={formatMoney(energy?.today_cost ?? 0, currency)} />
        <Metric
          label="Bill this cycle"
          value={formatMoney(energy?.cycle_cost ?? 0, currency)}
          sub={`Projected ${formatMoney(energy?.projected_cost ?? 0, currency)}`}
        />
        {climate.pm25 != null ? (
          <Metric label="Air quality" value={<span>{formatNumber(climate.pm25, 0)} <span className="text-title font-normal text-muted">µg/m³</span></span>} sub={`PM2.5 · ${aq?.label}`} />
        ) : (
          <Metric
            label="Climate"
            value={climate.temp != null ? `${formatNumber(climate.temp)} °C` : '—'}
            sub={climate.humidity != null ? `${formatNumber(climate.humidity, 0)} % humidity` : 'No sensors'}
          />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span>
                Devices{offline > 0 && <span className="ml-2 text-danger">{offline} offline</span>}
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
            <p className="p-8 text-center text-muted">No devices in this room.</p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((d) => (
                <DeviceRow key={d.id} device={d} room={room === 'all' ? rooms.find((r) => r.id === d.room_id) : undefined} onOpen={() => setOpen(d.id)} />
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Energy · 24 hours" action={<Link to="/energy" className="text-label text-muted hover:text-fg">Details</Link>} />
            <div className="p-4">
              <EnergyChart points={history.data ?? []} range="day" currency={currency} height={110} />
              {energy?.settings.monthly_budget ? (
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-label">
                    <span className="text-muted">Budget</span>
                    <span className="tabular">
                      {formatMoney(energy.cycle_cost, currency)} / {formatMoney(energy.settings.monthly_budget, currency)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-label="Budget used" aria-valuenow={Math.round(energy.budget_used_percent ?? 0)} aria-valuemin={0} aria-valuemax={100}>
                    <div className={cn('h-full rounded-full transition-[width] duration-slow', (energy.budget_used_percent ?? 0) > 90 ? 'bg-danger' : 'bg-fg')} style={{ width: `${Math.min(energy.budget_used_percent ?? 0, 100)}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Scenes" action={<Link to="/automations" className="text-label text-muted hover:text-fg">Manage</Link>} />
            {scenes.length === 0 ? (
              <p className="px-4 py-6 text-label text-muted">No scenes. Create one under Automations.</p>
            ) : (
              <ul className="divide-y divide-border">
                {scenes.map((s) => (
                  <li key={s.id} className="flex min-h-12 items-center gap-3 px-4">
                    <span className="min-w-0 flex-1 truncate text-body">{s.name}</span>
                    <Button size="sm" disabled={!control} loading={runScene.isPending && runScene.variables === s.id} onClick={() => runScene.mutate(s.id)}>
                      Run
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
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
