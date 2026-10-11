import { t } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { useConfirmSwitch } from '@/components/devices/ConfirmSwitch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Segmented, Slider, Switch } from '@/components/ui/Controls'
import { Field, SelectField } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Card'
import { EnergyChart } from './EnergyChart'
import { FanSpeedSlider } from './FanSpeedSlider'
import { LightColorControls } from './LightColorControls'
import { LightEffects, LightMoods, useEffectCatalog } from './LightScenes'
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
  const guard = useConfirmSwitch()
  const control = useCanControl() && device.can_control && device.is_online
  const admin = useIsAdmin()
  const { data: rooms = [] } = useRooms()
  const { data: energy } = useEnergy()
  const qc = useQueryClient()
  const toast = useToast()
  const s = device.state
  const { data: catalog } = useEffectCatalog()

  const [brightness, setBrightness] = useState(s.brightness ?? 0)
  const [colorTemp, setColorTemp] = useState(s.color_temp ?? 50)
  const [color, setColor] = useState(s.color ?? '#F59E0B')
  const [colorMode, setColorMode] = useState<string | undefined>(s.color_mode)
  useEffect(() => setBrightness(s.brightness ?? 0), [s.brightness])
  useEffect(() => setColorTemp(s.color_temp ?? 50), [s.color_temp])
  useEffect(() => {
    if (s.color) setColor(s.color)
  }, [s.color])
  useEffect(() => {
    if (s.color_mode) setColorMode(s.color_mode)
  }, [s.color_mode])
  const [name, setName] = useState(device.name)
  const [roomId, setRoomId] = useState(device.room_id ?? '')
  const [confirm, setConfirm] = useState(false)

  const metered = s.current_power_watts != null
  const history = useQuery({ queryKey: keys.energyHistory('day', device.id), queryFn: () => api.energyHistory('day', device.id), enabled: metered })
  const send = (cmd: DeviceCommand) => command.mutate({ id: device.id, cmd })

  const save = useMutation({
    // Only administrators may move a device; the server refuses a room from anyone else.
    mutationFn: () => api.updateDevice(device.id, admin ? { name, room_id: roomId || null } : { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.devices })
      toast.push({ tone: 'success', title: t('drawer.updated') })
    },
    onError: (e) => toast.push({ tone: 'error', title: t('drawer.saveFailed'), message: errorMessage(e) }),
  })
  // Saved at once, not with "Save changes": it is a setting of how the device is handled, not of its name.
  const ask = useMutation({
    mutationFn: (on: boolean) => api.updateDevice(device.id, { confirm_changes: on }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.devices }),
    onError: (e) => toast.push({ tone: 'error', title: t('drawer.saveFailed'), message: errorMessage(e) }),
  })
  const remove = useMutation({
    mutationFn: () => api.removeDevice(device.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.devices })
      toast.push({ tone: 'success', title: t('drawer.removed', { name: device.name }) })
      setConfirm(false)
      onClose()
    },
    onError: (e) => toast.push({ tone: 'error', title: t('drawer.removeFailed'), message: errorMessage(e) }),
  })
  const refresh = useMutation({
    mutationFn: () => api.refresh(device.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.devices }),
    onError: (e) => toast.push({ tone: 'error', title: t('drawer.refreshFailed'), message: errorMessage(e) }),
  })

  const readings: [string, string][] = []
  if (s.air_quality_pm25 != null) readings.push([t('reading.pm25'), `${formatNumber(s.air_quality_pm25, 0)} µg/m³ · ${airQuality(s.air_quality_pm25)?.label}`])
  if (s.temperature != null) readings.push([t('reading.temperature'), `${formatNumber(s.temperature)} °C`])
  if (s.humidity != null) readings.push([t('reading.humidity'), `${formatNumber(s.humidity, 0)} %`])
  if (s.current_power_watts != null) readings.push([t('reading.power'), formatWatts(s.current_power_watts)])
  if (s.voltage != null) readings.push([t('reading.voltage'), `${formatNumber(s.voltage)} V`])
  if (s.current_amps != null) readings.push([t('reading.current'), `${formatNumber(s.current_amps, 2)} A`])
  if (s.today_energy_kwh != null) readings.push([t('reading.energyToday'), formatKwh(s.today_energy_kwh)])
  if (s.filter_life != null) readings.push([t('reading.filterLife'), `${formatNumber(s.filter_life, 0)} %`])
  // What a sensor last saw, and how its battery is doing.
  if (typeof s.motion === 'boolean') readings.push([t('reading.motion'), t(s.motion ? 'reading.detected' : 'reading.clear')])
  if (typeof s.contact === 'boolean') readings.push([t('reading.doorWindow'), t(s.contact ? 'reading.open' : 'reading.closed')])
  if (typeof s.water_leak === 'boolean') readings.push([t('reading.water'), t(s.water_leak ? 'reading.leak' : 'reading.dry')])
  if (typeof s.alarm === 'boolean') readings.push([t('reading.alarm'), t(s.alarm ? 'reading.sounding' : 'reading.quiet')])
  if (typeof s.battery === 'number') readings.push([t('reading.battery'), `${formatNumber(s.battery, 0)} %`])
  else if (typeof s.battery_low === 'boolean') readings.push([t('reading.battery'), t(s.battery_low ? 'reading.low' : 'reading.ok')])
  const fan = s.options?.fan_speed
  const modes = s.options?.mode

  const isLight = device.device_type === 'light' || s.color != null || s.color_temp != null || s.brightness != null

  return (
    <div>
      {guard.dialog}
      <div className="mb-6 flex items-center gap-2">
        <Badge tone={device.is_online ? 'on' : 'danger'}>{t(device.is_online ? 'device.online' : 'device.offline')}</Badge>
        <span className="min-w-0 flex-1 truncate text-label text-muted">
          {[device.model, device.ip_address, t('drawer.seen', { when: timeAgo(device.last_seen) })].filter(Boolean).join(' · ')}
        </span>
        <Button variant="ghost" size="sm" aria-label={t('drawer.refresh')} icon={<ArrowsClockwise size={16} />} loading={refresh.isPending} onClick={() => refresh.mutate()} />
      </div>

      {(canToggle(device) || isLight || fan?.length || modes?.length) && (
        <Section title={t('drawer.controls')}>
          <div className="rounded-lg border border-border px-4">
            {canToggle(device) && (
              <div className="flex min-h-12 items-center justify-between border-b border-border last:border-0">
                <span className="text-body">{t('drawer.power')}</span>
                <span className="flex items-center gap-3">
                  <span className="text-label text-muted">{t(s.is_on ? 'device.on' : 'device.off')}</span>
                  <Switch checked={!!s.is_on} onChange={(v) => guard.ask([device], v, () => send({ is_on: v }))} label={t('drawer.power')} disabled={!control} />
                </span>
              </div>
            )}
            {s.brightness != null && (
              <div className="border-b border-border py-3 last:border-0">
                <div className="flex justify-between text-body">
                  <span>{t('drawer.brightness')}</span>
                  <span className="text-muted tabular">{brightness}%</span>
                </div>
                <Slider label={t('drawer.brightness')} min={1} value={brightness} onChange={setBrightness} onCommit={(v) => send({ brightness: v })} disabled={!control} />
              </div>
            )}
            {isLight && (
              <div className="border-b border-border py-3.5 last:border-0">
                <LightColorControls
                  color={color}
                  colorTemp={colorTemp}
                  colorMode={colorMode}
                  brightness={s.brightness != null ? brightness : (s.is_on ? 100 : 0)}
                  isOn={s.is_on !== false}
                  disabled={!control}
                  onChangeColor={(c) => setColor(c)}
                  onCommitColor={(c) => {
                    setColor(c)
                    send({ color: c, color_mode: 'color' })
                  }}
                  onChangeColorTemp={(t) => setColorTemp(t)}
                  onCommitColorTemp={(t) => {
                    setColorTemp(t)
                    send({ color_temp: t, color_mode: 'white' })
                  }}
                  onChangeColorMode={(m) => {
                    setColorMode(m)
                    send({ color_mode: m })
                  }}
                  moods={<LightMoods device={device} disabled={!control} onPick={(id) => send({ effect: id })} />}
                  effects={s.options?.effect?.length ? <LightEffects device={device} disabled={!control} onPick={(id) => send({ effect: id })} /> : undefined}
                  playing={s.effect ? (catalog?.effects.find((e) => e.id === s.effect)?.name ?? s.effect) : undefined}
                />
              </div>
            )}
            {fan && fan.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0">
                <span className="text-body">{t('drawer.fanSpeed')}</span>
                <Segmented size="sm" label={t('drawer.fanSpeed')} value={s.fan_speed} options={fan.map((o) => ({ value: o, label: o }))} onChange={(v) => control && send({ fan_speed: v })} />
              </div>
            )}
            {modes && modes.length > 0 && (
              <div className="border-b border-border last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-body">{t('drawer.mode')}</span>
                  <Segmented size="sm" label={t('drawer.mode')} value={s.mode} options={modes.map((o) => ({ value: o, label: o }))} onChange={(v) => control && send({ mode: v })} />
                </div>
                <FanSpeedSlider device={device} disabled={!control} className="pb-3" />
              </div>
            )}
          </div>
        </Section>
      )}

      {readings.length > 0 && (
        <Section title={t('drawer.readings')}>
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
        <Section title={t('drawer.energy24')}>
          <EnergyChart points={history.data ?? []} range="day" currency={energy?.settings.currency ?? 'USD'} height={120} />
        </Section>
      )}

      {(admin || device.can_edit) && (
        <Section title={t('drawer.settings')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} />
            {admin && (
              <SelectField label={t('common.room')} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">{t('devices.noRoom')}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
          {canToggle(device) && (
            <div className="mt-4 flex min-h-12 items-center justify-between gap-4 rounded-lg border border-border px-4 py-2">
              <div>
                <p className="text-body">{t('drawer.askBefore.title')}</p>
                <p className="text-label text-muted">{t('drawer.askBefore.hint')}</p>
              </div>
              <Switch checked={device.confirm_changes} onChange={(on) => ask.mutate(on)} label={t('drawer.askBefore.title')} disabled={ask.isPending} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            {admin ? (
              <Button variant="danger" onClick={() => setConfirm(true)}>
                {t('drawer.remove')}
              </Button>
            ) : (
              <span />
            )}
            <Button variant="primary" loading={save.isPending} disabled={!name.trim() || (name === device.name && (!admin || roomId === (device.room_id ?? '')))} onClick={() => save.mutate()}>
              {t('drawer.saveChanges')}
            </Button>
          </div>
        </Section>
      )}

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={t('drawer.removeTitle', { name: device.name })}
        message={t('drawer.removeMessage')}
        confirmLabel={t('drawer.removeConfirm')}
      />
    </div>
  )
}
