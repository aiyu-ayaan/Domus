import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowsClockwise, Trash } from '@phosphor-icons/react'
import { Sheet, Confirm } from './Sheet'
import { Button } from './Button'
import { Segmented, Slider, Switch } from './Controls'
import { Field, SelectField } from './Field'
import { Badge } from './Layout'
import { EnergyChart } from './EnergyChart'
import { api } from '@/lib/api'
import { keys, useCommand, useEnergy, useRooms } from '@/lib/queries'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { errorMessage, useToast } from '@/lib/toast'
import { canToggle, deviceIcons, deviceTone, deviceTypeLabel, integrationLabel } from '@/lib/devices'
import { airQuality, formatKwh, formatNumber, formatWatts, timeAgo } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Device } from '@/lib/types'

const toneFill = { light: 'bg-light', air: 'bg-air', power: 'bg-power', accent: 'bg-accent' }

function Reading({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-3xl bg-line/[0.05] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular', tone)}>{value}</p>
    </div>
  )
}

export function DeviceSheet({ device, onClose }: { device: Device | null; onClose: () => void }) {
  return (
    <Sheet open={!!device} onClose={onClose} title={device?.name ?? ''} size="lg">
      {device && <DeviceDetail device={device} onClose={onClose} />}
    </Sheet>
  )
}

function DeviceDetail({ device, onClose }: { device: Device; onClose: () => void }) {
  const command = useCommand()
  const control = useCanControl() && device.is_online
  const admin = useIsAdmin()
  const { data: rooms = [] } = useRooms()
  const { data: energy } = useEnergy()
  const qc = useQueryClient()
  const toast = useToast()
  const s = device.state
  const Icon = deviceIcons[device.device_type]
  const tone = deviceTone(device.device_type)

  // Local slider values so dragging stays smooth; committed on release.
  const [brightness, setBrightness] = useState(s.brightness ?? 0)
  const [colorTemp, setColorTemp] = useState(s.color_temp ?? 50)
  useEffect(() => setBrightness(s.brightness ?? 0), [s.brightness])
  useEffect(() => setColorTemp(s.color_temp ?? 50), [s.color_temp])

  const [name, setName] = useState(device.name)
  const [roomId, setRoomId] = useState(device.room_id ?? '')
  const [confirm, setConfirm] = useState(false)
  const metered = s.current_power_watts != null
  const history = useQuery({
    queryKey: keys.energyHistory('day', device.id),
    queryFn: () => api.energyHistory('day', device.id),
    enabled: metered,
  })

  const save = useMutation({
    mutationFn: () => api.updateDevice(device.id, { name, room_id: roomId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.devices })
      toast.push({ tone: 'success', title: 'Device updated' })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not save', message: errorMessage(e) }),
  })
  const remove = useMutation({
    mutationFn: () => api.removeDevice(device.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.devices })
      toast.push({ tone: 'success', title: `${device.name} removed` })
      setConfirm(false)
      onClose()
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not remove', message: errorMessage(e) }),
  })
  const refresh = useMutation({
    mutationFn: () => api.refresh(device.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.devices }),
    onError: (e) => toast.push({ tone: 'error', title: 'Refresh failed', message: errorMessage(e) }),
  })

  const send = (cmd: Parameters<typeof command.mutate>[0]['cmd']) => command.mutate({ id: device.id, cmd })
  const readings: { label: string; value: string; tone?: string }[] = []
  if (s.air_quality_pm25 != null) {
    const aq = airQuality(s.air_quality_pm25)
    readings.push({ label: 'PM2.5', value: `${formatNumber(s.air_quality_pm25, 0)} µg/m³`, tone: aq?.tone })
  }
  if (s.temperature != null) readings.push({ label: 'Temperature', value: `${formatNumber(s.temperature)}°C` })
  if (s.humidity != null) readings.push({ label: 'Humidity', value: `${formatNumber(s.humidity, 0)}%` })
  if (s.current_power_watts != null) readings.push({ label: 'Power now', value: formatWatts(s.current_power_watts) })
  if (s.voltage != null) readings.push({ label: 'Voltage', value: `${formatNumber(s.voltage)} V` })
  if (s.current_amps != null) readings.push({ label: 'Current', value: `${formatNumber(s.current_amps, 2)} A` })
  if (s.today_energy_kwh != null) readings.push({ label: 'Today', value: formatKwh(s.today_energy_kwh) })
  if (s.filter_life != null) readings.push({ label: 'Filter life', value: `${formatNumber(s.filter_life, 0)}%` })

  const fanOptions = s.options?.fan_speed
  const modeOptions = s.options?.mode

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-3xl',
            s.is_on && device.is_online ? `${toneFill[tone]} text-black/80` : 'bg-line/[0.08] text-muted',
          )}
        >
          <Icon size={32} weight={s.is_on ? 'fill' : 'regular'} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{deviceTypeLabel[device.device_type]}</Badge>
            <Badge tone="info">{integrationLabel[device.integration_type] ?? device.integration_type}</Badge>
            {device.is_online ? <Badge tone="accent">Online</Badge> : <Badge tone="danger">Offline</Badge>}
          </div>
          <p className="mt-1.5 truncate text-sm text-muted">
            {device.model ?? 'Unknown model'}
            {device.ip_address ? ` · ${device.ip_address}` : ''} · seen {timeAgo(device.last_seen)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh.mutate()}
          loading={refresh.isPending}
          icon={<ArrowsClockwise size={18} />}
          aria-label="Refresh state"
        />
      </div>

      {canToggle(device) && (
        <div className="flex items-center justify-between rounded-3xl bg-line/[0.05] p-4">
          <div>
            <p className="font-semibold">Power</p>
            <p className="text-sm text-muted">{s.is_on ? 'On' : 'Off'}</p>
          </div>
          <Switch
            checked={!!s.is_on}
            onChange={(v) => send({ is_on: v })}
            label={`${device.name} power`}
            disabled={!control}
            tone={tone}
          />
        </div>
      )}

      {s.brightness != null && (
        <div>
          <div className="flex justify-between text-sm font-semibold">
            <span>Brightness</span>
            <span className="tabular text-muted">{brightness}%</span>
          </div>
          <Slider
            label="Brightness"
            value={brightness}
            min={1}
            onChange={setBrightness}
            onCommit={(v) => send({ brightness: v })}
            tone="light"
            disabled={!control}
          />
        </div>
      )}
      {s.color_temp != null && (
        <div>
          <div className="flex justify-between text-sm font-semibold">
            <span>Colour temperature</span>
            <span className="text-muted">{colorTemp < 35 ? 'Warm' : colorTemp > 65 ? 'Cool' : 'Neutral'}</span>
          </div>
          <Slider
            label="Colour temperature"
            value={colorTemp}
            onChange={setColorTemp}
            onCommit={(v) => send({ color_temp: v })}
            disabled={!control}
          />
        </div>
      )}
      {fanOptions && fanOptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Fan speed</span>
          <Segmented
            label="Fan speed"
            value={s.fan_speed}
            options={fanOptions.map((o) => ({ value: o, label: o }))}
            onChange={(v) => control && send({ fan_speed: v })}
            className="w-full overflow-x-auto scrollbar-none"
          />
        </div>
      )}
      {modeOptions && modeOptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Mode</span>
          <Segmented
            label="Mode"
            value={s.mode}
            options={modeOptions.map((o) => ({ value: o, label: o }))}
            onChange={(v) => control && send({ mode: v })}
            className="w-full overflow-x-auto scrollbar-none"
          />
        </div>
      )}

      {readings.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {readings.map((r) => (
            <Reading key={r.label} {...r} />
          ))}
        </div>
      )}

      {metered && (
        <div>
          <p className="mb-3 text-sm font-semibold">Energy, last 24 hours</p>
          <EnergyChart points={history.data ?? []} range="day" currency={energy?.settings.currency ?? 'USD'} height={120} />
        </div>
      )}

      {admin && (
        <div className="flex flex-col gap-4 border-t border-line/10 pt-6">
          <h3 className="font-bold">Settings</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <SelectField label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">No room</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="danger" icon={<Trash size={18} />} onClick={() => setConfirm(true)}>
              Remove device
            </Button>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!name.trim() || (name === device.name && roomId === (device.room_id ?? ''))}
            >
              Save changes
            </Button>
          </div>
        </div>
      )}
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Remove ${device.name}?`}
        message="It will disappear from rooms, groups and automations. If it is still on your network, discovery will offer it again."
        confirmLabel="Remove"
      />
    </div>
  )
}
