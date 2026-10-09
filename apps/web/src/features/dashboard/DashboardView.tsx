import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight, Lightning, MagicWand, PuzzlePiece, Sparkle, Wind } from '@phosphor-icons/react'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { DeviceTile } from '@/components/DeviceTile'
import { DeviceSheet } from '@/components/DeviceSheet'
import { Card, EmptyState, SectionTitle, Skeleton } from '@/components/Layout'
import { Button } from '@/components/Button'
import { api } from '@/lib/api'
import { useAuth, useCanControl, useIsAdmin } from '@/lib/auth'
import { useDevices, useDiscovered, useEnergy, useRooms, useScenes } from '@/lib/queries'
import { airQuality, formatKwh, formatMoney, formatNumber, formatWatts, greeting } from '@/lib/format'
import { errorMessage, useToast } from '@/lib/toast'
import { cn } from '@/lib/cn'
import { spring, stagger } from '@/lib/motion'
import type { Device } from '@/lib/types'

function RoomChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: rooms = [] } = useRooms()
  const chips = [{ id: 'all', name: 'All' }, ...rooms]
  return (
    <div role="tablist" aria-label="Filter by room" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
      {chips.map((r) => {
        const active = value === r.id
        return (
          <button
            key={r.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.id)}
            className={cn(
              'relative h-10 shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold transition-colors duration-200',
              active ? 'text-on-accent' : 'glass-thin text-muted hover:text-fg',
            )}
          >
            {active && <motion.span layoutId="room-chip" transition={spring.default} className="absolute inset-0 rounded-full bg-accent" />}
            <span className="relative">{r.name}</span>
          </button>
        )
      })}
    </div>
  )
}

export function DashboardView() {
  const { user } = useAuth()
  const admin = useIsAdmin()
  const control = useCanControl()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: devices, isLoading } = useDevices()
  const { data: rooms = [] } = useRooms()
  const { data: energy } = useEnergy()
  const { data: scenes = [] } = useScenes()
  const { data: pending = [] } = useDiscovered('pending')
  const [room, setRoom] = useState('all')
  const [open, setOpen] = useState<string | null>(null)

  const activate = useMutation({
    mutationFn: (id: string) => api.activateScene(id),
    onSuccess: (r, id) => {
      const name = scenes.find((s) => s.id === id)?.name
      if (r.success) toast.push({ tone: 'success', title: `${name} activated` })
      else toast.push({ tone: 'warning', title: `${name} partly applied`, message: r.errors.join('; ') })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Scene failed', message: errorMessage(e) }),
  })

  const list = devices ?? []
  const shown = room === 'all' ? list : list.filter((d) => d.room_id === room)
  const onCount = list.filter((d) => d.is_online && d.state.is_on && d.device_type !== 'sensor').length
  const climate = useMemo(() => summarizeClimate(list), [list])
  const currency = energy?.settings.currency ?? 'USD'
  const budget = energy?.settings.monthly_budget
  const selected = list.find((d) => d.id === open) ?? null
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <div className="mb-6">
        <p className="text-sm font-semibold text-muted">{today}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {greeting()}, {user?.username}
        </h1>
      </div>

      {admin && pending.length > 0 && (
        <motion.button
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.bouncy}
          onClick={() => navigate('/devices?tab=discovered')}
          className="glass mb-6 flex w-full cursor-pointer items-center gap-4 rounded-4xl p-4 text-left"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent">
            <Sparkle size={24} weight="fill" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">
              {pending.length} new {pending.length === 1 ? 'device' : 'devices'} found
            </span>
            <span className="block truncate text-sm text-muted">{pending.map((p) => p.name).join(', ')}</span>
          </span>
          <ArrowRight size={20} className="text-muted" aria-hidden />
        </motion.button>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                <Lightning size={18} weight="fill" className="text-power" aria-hidden /> Using now
                <span className="relative flex h-2 w-2" aria-label="live">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-power opacity-60 motion-reduce:animate-none" />
                  <span className="relative h-2 w-2 rounded-full bg-power" />
                </span>
              </p>
              <p className="mt-2 text-5xl font-extrabold tracking-tight sm:text-6xl">
                <AnimatedNumber value={energy?.current_watts ?? 0} format={(v) => formatWatts(v)} />
              </p>
            </div>
            <Link to="/energy" className="glass-thin flex h-11 items-center gap-1 rounded-2xl px-4 text-sm font-semibold hover:text-accent">
              Details <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">Today</dt>
              <dd className="mt-1 font-bold tabular">
                {formatKwh(energy?.today_kwh)} · {formatMoney(energy?.today_cost ?? 0, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">This bill so far</dt>
              <dd className="mt-1 font-bold tabular">{formatMoney(energy?.cycle_cost ?? 0, currency)}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">Projected bill</dt>
              <dd className="mt-1 font-bold tabular">{formatMoney(energy?.projected_cost ?? 0, currency)}</dd>
            </div>
          </dl>
          {budget ? (
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-xs font-semibold text-muted">
                <span>Budget {formatMoney(budget, currency)}</span>
                <span className="tabular">{formatNumber(energy?.budget_used_percent ?? 0, 0)}% used</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line/10" role="progressbar" aria-valuenow={Math.round(energy?.budget_used_percent ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
                <motion.div
                  className={cn('h-full rounded-full', (energy?.budget_used_percent ?? 0) > 90 ? 'bg-danger' : 'bg-power')}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(energy?.budget_used_percent ?? 0, 100)}%` }}
                  transition={spring.gentle}
                />
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Wind size={18} weight="fill" className="text-air" aria-hidden /> Air & climate
          </p>
          {climate.pm25 == null && climate.temp == null ? (
            <p className="mt-4 text-sm text-muted">Add an air purifier or sensor to see air quality and temperature here.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {climate.pm25 != null && (
                <div>
                  <p className={cn('text-4xl font-extrabold', airQuality(climate.pm25)?.tone)}>{airQuality(climate.pm25)?.label}</p>
                  <p className="text-sm text-muted tabular">PM2.5 {formatNumber(climate.pm25, 0)} µg/m³</p>
                </div>
              )}
              {climate.temp != null && (
                <div className="flex gap-6">
                  <div>
                    <p className="text-2xl font-bold tabular">{formatNumber(climate.temp)}°</p>
                    <p className="text-xs text-muted">Temperature</p>
                  </div>
                  {climate.humidity != null && (
                    <div>
                      <p className="text-2xl font-bold tabular">{formatNumber(climate.humidity, 0)}%</p>
                      <p className="text-xs text-muted">Humidity</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="mt-5 text-sm text-muted">
            <span className="font-bold text-fg">{onCount}</span> of {list.filter((d) => d.device_type !== 'sensor').length} devices on
          </p>
        </Card>
      </div>

      {scenes.length > 0 && (
        <>
          <SectionTitle>Scenes</SectionTitle>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
            {scenes.map((s) => (
              <motion.button
                key={s.id}
                whileTap={{ scale: 0.95 }}
                transition={spring.fast}
                disabled={!control || activate.isPending}
                onClick={() => activate.mutate(s.id)}
                className={cn(
                  'glass-thin flex h-14 shrink-0 cursor-pointer items-center gap-3 rounded-3xl pl-2 pr-5 font-semibold disabled:cursor-not-allowed disabled:opacity-60',
                  s.is_active && 'ring-2 ring-accent/60',
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <MagicWand size={20} weight="fill" aria-hidden />
                </span>
                {s.name}
              </motion.button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Devices</SectionTitle>
      {rooms.length > 0 && <RoomChips value={room} onChange={setRoom} />}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[148px] rounded-4xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<PuzzlePiece size={30} />}
          title="No devices yet"
          message={admin ? 'Connect Tuya, Tapo or Xiaomi in Plugins. New devices on your network show up automatically.' : 'An administrator has not added any devices you can access yet.'}
          action={admin && <Button variant="primary" onClick={() => navigate('/plugins')}>Open plugins</Button>}
        />
      ) : shown.length === 0 ? (
        <p className="surface rounded-4xl p-8 text-center text-muted">No devices in this room.</p>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((d) => (
            <DeviceTile key={d.id} device={d} room={room === 'all' ? rooms.find((r) => r.id === d.room_id) : undefined} onOpen={() => setOpen(d.id)} />
          ))}
        </motion.div>
      )}
      <DeviceSheet device={selected} onClose={() => setOpen(null)} />
    </motion.div>
  )
}

function summarizeClimate(devices: Device[]) {
  const online = devices.filter((d) => d.is_online)
  const pms = online.map((d) => d.state.air_quality_pm25).filter((v): v is number => v != null)
  const temps = online.map((d) => d.state.temperature).filter((v): v is number => v != null)
  const hums = online.map((d) => d.state.humidity).filter((v): v is number => v != null)
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : undefined)
  return { pm25: pms.length ? Math.max(...pms) : undefined, temp: avg(temps), humidity: avg(hums) }
}
