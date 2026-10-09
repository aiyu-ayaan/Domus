import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Segmented, Slider, Switch } from '@/components/ui/Controls'
import { Field, SelectField } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Card'
import { EnergyChart } from './EnergyChart'
import { api } from '@/lib/api'
import { keys, useCommand, useEnergy, useRooms } from '@/lib/queries'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { errorMessage, useToast } from '@/lib/toast'
import { canToggle, deviceTypeLabel, integrationLabel } from '@/lib/devices'
import { airQuality, formatKwh, formatNumber, formatWatts, timeAgo } from '@/lib/format'
import type { Device, DeviceCommand } from '@/lib/types'

export function DeviceDrawer({ device, onClose }: { device: Device | null; onClose: () => void }) {
  return (
    <Sheet open={!!device} onClose={onClose} title={device?.name ?? ''} description={device ? `${deviceTypeLabel[device.device_type]} · ${integrationLabel[device.integration_type] ?? device.integration_type}` : undefined} size="lg">
      {device && <Detail device={device} onClose={onClose} />}
    </Sheet>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-body text-muted">{label}</span>
      <span className="text-body tabular">{children}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-label font-medium text-muted">{title}</h3>
      {children}
    </section>
  )
}

function Detail({ device, onClose }: { device: Device; onClose: () => void }) {
  const command = useCommand()
  const control = useCanControl() && device.is_online
  const admin = useIsAdmin()
  const { data: rooms = [] } = useRooms()
  const { data: energy } = useEnergy()
  const qc = useQueryClient()
  const toast = useToast()
  const s = device.state

  const [brightness, setBrightness] = useState(s.brightness ?? 0)
  const [colorTemp, setColorTemp] = useState(s.color_temp ?? 50)
  useEffect(() => setBrightness(s.brightness ?? 0), [s.brightness])
  useEffect(() => setColorTemp(s.color_temp ?? 50), [s.color_temp])
  const [name, setName] = useState(device.name)
  const [roomId, setRoomId] = useState(device.room_id ?? '')
  const [confirm, setConfirm] = useState(false)

  const metered = s.current_power_watts != null
  const history = useQuery({ queryKey: keys.energyHistory('day', device.id), queryFn: () => api.energyHistory('day', device.id), enabled: metered })
  const send = (cmd: DeviceCommand) => command.mutate({ id: device.id, cmd })

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

  const readings: [string, string][] = []
  if (s.air_quality_pm25 != null) readings.push(['PM2.5', `${formatNumber(s.air_quality_pm25, 0)} µg/m³ · ${airQuality(s.air_quality_pm25)?.label}`])
  if (s.temperature != null) readings.push(['Temperature', `${formatNumber(s.temperature)} °C`])
  if (s.humidity != null) readings.push(['Humidity', `${formatNumber(s.humidity, 0)} %`])
  if (s.current_power_watts != null) readings.push(['Power', formatWatts(s.current_power_watts)])
  if (s.voltage != null) readings.push(['Voltage', `${formatNumber(s.voltage)} V`])
  if (s.current_amps != null) readings.push(['Current', `${formatNumber(s.current_amps, 2)} A`])
  if (s.today_energy_kwh != null) readings.push(['Energy today', formatKwh(s.today_energy_kwh)])
  if (s.filter_life != null) readings.push(['Filter life', `${formatNumber(s.filter_life, 0)} %`])
  const fan = s.options?.fan_speed
  const modes = s.options?.mode

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Badge tone={device.is_online ? 'on' : 'danger'}>{device.is_online ? 'Online' : 'Offline'}</Badge>
        <span className="min-w-0 flex-1 truncate text-label text-muted">
          {[device.model, device.ip_address, `seen ${timeAgo(device.last_seen)}`].filter(Boolean).join(' · ')}
        </span>
        <Button variant="ghost" size="sm" aria-label="Refresh state" icon={<ArrowsClockwise size={16} />} loading={refresh.isPending} onClick={() => refresh.mutate()} />
      </div>

      {(canToggle(device) || s.brightness != null || fan?.length || modes?.length) && (
        <Section title="Controls">
          <div className="rounded-lg border border-border px-4">
            {canToggle(device) && (
              <div className="flex min-h-12 items-center justify-between border-b border-border last:border-0">
                <span className="text-body">Power</span>
                <span className="flex items-center gap-3">
                  <span className="text-label text-muted">{s.is_on ? 'On' : 'Off'}</span>
                  <Switch checked={!!s.is_on} onChange={(v) => send({ is_on: v })} label="Power" disabled={!control} />
                </span>
              </div>
            )}
            {s.brightness != null && (
              <div className="border-b border-border py-3 last:border-0">
                <div className="flex justify-between text-body">
                  <span>Brightness</span>
                  <span className="text-muted tabular">{brightness}%</span>
                </div>
                <Slider label="Brightness" min={1} value={brightness} onChange={setBrightness} onCommit={(v) => send({ brightness: v })} disabled={!control} />
              </div>
            )}
            {s.color_temp != null && (
              <div className="border-b border-border py-3 last:border-0">
                <div className="flex justify-between text-body">
                  <span>Colour temperature</span>
                  <span className="text-muted">{colorTemp < 35 ? 'Warm' : colorTemp > 65 ? 'Cool' : 'Neutral'}</span>
                </div>
                <Slider label="Colour temperature" value={colorTemp} onChange={setColorTemp} onCommit={(v) => send({ color_temp: v })} disabled={!control} />
              </div>
            )}
            {fan && fan.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0">
                <span className="text-body">Fan speed</span>
                <Segmented size="sm" label="Fan speed" value={s.fan_speed} options={fan.map((o) => ({ value: o, label: o }))} onChange={(v) => control && send({ fan_speed: v })} />
              </div>
            )}
            {modes && modes.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0">
                <span className="text-body">Mode</span>
                <Segmented size="sm" label="Mode" value={s.mode} options={modes.map((o) => ({ value: o, label: o }))} onChange={(v) => control && send({ mode: v })} />
              </div>
            )}
          </div>
        </Section>
      )}

      {readings.length > 0 && (
        <Section title="Readings">
          <div className="rounded-lg border border-border px-4">
            {readings.map(([k, v]) => (
              <Row key={k} label={k}>
                {v}
              </Row>
            ))}
          </div>
        </Section>
      )}

      {metered && (
        <Section title="Energy · last 24 hours">
          <EnergyChart points={history.data ?? []} range="day" currency={energy?.settings.currency ?? 'USD'} height={120} />
        </Section>
      )}

      {admin && (
        <Section title="Settings">
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
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Remove device
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={!name.trim() || (name === device.name && roomId === (device.room_id ?? ''))} onClick={() => save.mutate()}>
              Save changes
            </Button>
          </div>
        </Section>
      )}

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Remove ${device.name}?`}
        message="It is removed from rooms, groups and automations. If it is still on your network, discovery will offer it again."
        confirmLabel="Remove"
      />
    </div>
  )
}
