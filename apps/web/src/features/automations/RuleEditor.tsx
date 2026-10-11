import type { ReactNode } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { Field, SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { useDevices, useGroups, useHomeLocation, useScenes } from '@/lib/queries'
import { formatClockTime, formatTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import { COLOR_PRESETS, WHITE_PRESETS } from '@/components/devices/LightColorControls'
import type { Action, Condition, Device, DeviceCommand, Trigger } from '@/lib/types'

export const PROPERTIES: { value: string; label: string; kind: 'bool' | 'number' }[] = [
  { value: 'is_on', label: t('reading.power'), kind: 'bool' },
  { value: 'is_online', label: t('device.online'), kind: 'bool' },
  { value: 'current_power_watts', label: t('rule.prop.powerWatts'), kind: 'number' },
  { value: 'air_quality_pm25', label: t('reading.pm25'), kind: 'number' },
  { value: 'temperature', label: t('reading.temperature'), kind: 'number' },
  { value: 'humidity', label: t('reading.humidity'), kind: 'number' },
  { value: 'brightness', label: t('drawer.brightness'), kind: 'number' },
  { value: 'color_temp', label: t('rule.prop.colorTemp'), kind: 'number' },
]
const DAYS = [
  t('rule.day.mon'),
  t('rule.day.tue'),
  t('rule.day.wed'),
  t('rule.day.thu'),
  t('rule.day.fri'),
  t('rule.day.sat'),
  t('rule.day.sun'),
]

const deviceName = (devices: Device[], id: string) => devices.find((d) => d.id === id)?.name ?? t('rule.deviceFallback')

function describeStateTrigger(device: string, c: { equals?: unknown; above?: number; below?: number }, propName: string): string {
  const prop = PROPERTIES.find((x) => x.value === propName)?.label ?? propName
  if (c.equals !== undefined) {
    if (propName === 'is_on') return c.equals ? t('rule.when.turnsOn', { device }) : t('rule.when.turnsOff', { device })
    if (propName === 'is_online') return c.equals ? t('rule.when.comesOnline', { device }) : t('rule.when.goesOffline', { device })
    return t('rule.when.equals', { device, prop, value: String(c.equals) })
  }
  if (c.above !== undefined) return t('rule.when.above', { device, prop, value: c.above })
  if (c.below !== undefined) return t('rule.when.below', { device, prop, value: c.below })
  return t('rule.when.changes', { device, prop })
}

export function describeTrigger(trig: Trigger, devices: Device[]): string {
  switch (trig.type) {
    case 'time': {
      const hasDays = trig.days.length > 0 && trig.days.length < 7
      return hasDays
        ? t('rule.time.onDays', { time: formatClockTime(trig.at), days: trig.days.map((d) => DAYS[d]).join(', ') })
        : t('rule.time.everyDay', { time: formatClockTime(trig.at) })
    }
    case 'sun': {
      const event = t(trig.event === 'sunrise' ? 'rule.sunriseLower' : 'rule.sunsetLower')
      const hasDays = trig.days.length > 0 && trig.days.length < 7
      const days = trig.days.map((d) => DAYS[d]).join(', ')
      if (!trig.offset_minutes) {
        return hasDays ? t('rule.sun.at.onDays', { event, days }) : t('rule.sun.at.everyDay', { event })
      }
      const minutes = Math.abs(trig.offset_minutes)
      if (trig.offset_minutes < 0) {
        return hasDays ? t('rule.sun.before.onDays', { minutes, event, days }) : t('rule.sun.before.everyDay', { minutes, event })
      }
      return hasDays ? t('rule.sun.after.onDays', { minutes, event, days }) : t('rule.sun.after.everyDay', { minutes, event })
    }
    case 'device_state':
      return describeStateTrigger(deviceName(devices, trig.device_id), trig, trig.property)
    case 'power_above':
      return t('rule.when.powerAbove', { device: deviceName(devices, trig.device_id), watts: trig.watts })
    case 'device_offline':
      return t('rule.when.goesOffline', { device: deviceName(devices, trig.device_id) })
    case 'device_discovered':
      return t('rule.when.deviceDiscovered')
  }
}

export function describeAction(a: Action, devices: Device[], groups: { id: string; name: string }[], scenes: { id: string; name: string }[]): string {
  const cmd = (c: DeviceCommand, target: string) => {
    if (c.color) return t('rule.action.setColor', { target, color: c.color })
    if (c.color_temp !== undefined) return t('rule.action.setColorTemp', { target, value: c.color_temp })
    if (c.brightness !== undefined) return t('rule.action.setBrightness', { target, value: c.brightness })
    return c.is_on ? t('rule.action.turnOn', { target }) : t('rule.action.turnOff', { target })
  }
  switch (a.type) {
    case 'device_command':
      return cmd(a.command, deviceName(devices, a.device_id))
    case 'group_command':
      return cmd(a.command, groups.find((g) => g.id === a.group_id)?.name ?? t('rule.groupFallback'))
    case 'notify':
      return t('rule.action.notify', { title: a.title })
    case 'scene':
      return t('rule.action.scene', { name: scenes.find((s) => s.id === a.scene_id)?.name ?? t('rule.sceneFallback') })
    case 'delay':
      return t('rule.action.delay', { seconds: a.seconds })
  }
}

function Row({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="relative rounded-lg border border-border bg-raised/40 p-4 pr-12">
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('drawer.removeConfirm')}
        className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-subtle hover:bg-danger/10 hover:text-danger"
      >
        <Trash size={16} />
      </button>
    </div>
  )
}

function DeviceSelect({ value, onChange, filter }: { value: string; onChange: (v: string) => void; filter?: (d: Device) => boolean }) {
  const { data: devices = [] } = useDevices()
  return (
    <SelectField label={t('device.type.other')} value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">{t('rule.choose')}</option>
      {devices.filter(filter ?? (() => true)).map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </SelectField>
  )
}

function StateCompare<T extends { property: string; equals?: unknown; above?: number; below?: number }>({
  value,
  onChange,
}: {
  value: T
  onChange: (v: T) => void
}) {
  const prop = PROPERTIES.find((p) => p.value === value.property) ?? PROPERTIES[0]
  const op = value.above !== undefined ? 'above' : value.below !== undefined ? 'below' : 'equals'
  const base = { ...value, equals: undefined, above: undefined, below: undefined }
  return (
    <>
      <SelectField
        label={t('rule.property')}
        value={value.property}
        onChange={(e) => {
          const p = PROPERTIES.find((x) => x.value === e.target.value)!
          onChange({ ...base, property: p.value, ...(p.kind === 'bool' ? { equals: true } : { above: 0 }) } as T)
        }}
      >
        {PROPERTIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </SelectField>
      {prop.kind === 'bool' ? (
        <SelectField label={t('rule.is')} value={String(value.equals ?? true)} onChange={(e) => onChange({ ...base, equals: e.target.value === 'true' } as T)}>
          <option value="true">{prop.value === 'is_online' ? t('device.online') : t('device.on')}</option>
          <option value="false">{prop.value === 'is_online' ? t('device.offline') : t('device.off')}</option>
        </SelectField>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label={t('rule.is')}
            value={op}
            onChange={(e) => {
              const n = Number(value.above ?? value.below ?? value.equals ?? 0)
              onChange({ ...base, [e.target.value]: n } as T)
            }}
          >
            <option value="above">{t('rule.op.above')}</option>
            <option value="below">{t('rule.op.below')}</option>
            <option value="equals">{t('rule.op.equals')}</option>
          </SelectField>
          <Field
            label={t('rule.value')}
            type="number"
            inputMode="decimal"
            value={String(value.above ?? value.below ?? value.equals ?? 0)}
            onChange={(e) => onChange({ ...base, [op]: Number(e.target.value) } as T)}
          />
        </div>
      )}
    </>
  )
}

type SunTrigger = Extract<Trigger, { type: 'sun' }>

function SunFields({ value, onChange }: { value: SunTrigger; onChange: (v: SunTrigger) => void }) {
  const { data: place } = useHomeLocation()
  const today = value.event === 'sunrise' ? place?.sunrise : place?.sunset
  const before = value.offset_minutes < 0
  const eventLower = t(value.event === 'sunrise' ? 'rule.sunriseLower' : 'rule.sunsetLower')
  return (
    <>
      <SelectField label={t('rule.sun.event')} value={value.event} onChange={(e) => onChange({ ...value, event: e.target.value as SunTrigger['event'] })}>
        <option value="sunrise">{t('rule.sunrise')}</option>
        <option value="sunset">{t('rule.sunset')}</option>
      </SelectField>
      <SelectField label={t('rule.sun.shift')} value={before ? 'before' : 'after'} onChange={(e) => onChange({ ...value, offset_minutes: Math.abs(value.offset_minutes) * (e.target.value === 'before' ? -1 : 1) })}>
        <option value="after">{t('rule.sun.after')}</option>
        <option value="before">{t('rule.sun.before')}</option>
      </SelectField>
      <Field
        label={t('rule.sun.minutes')}
        type="number"
        min={0}
        max={360}
        value={String(Math.abs(value.offset_minutes))}
        onChange={(e) => onChange({ ...value, offset_minutes: Math.min(360, Math.abs(Math.round(Number(e.target.value)) || 0)) * (before ? -1 : 1) })}
      />
      <p className={cn('text-label sm:col-span-2', place && !today ? 'text-warn' : 'text-muted')}>
        {today ? t('rule.sun.today', { event: eventLower, time: formatTime(today) }) : place?.latitude == null ? t('rule.sun.noLocation') : t('rule.sun.noneToday', { event: eventLower })}
      </p>
    </>
  )
}

export function TriggerEditor({ value, onChange }: { value: Trigger[]; onChange: (v: Trigger[]) => void }) {
  const set = (i: number, trig: Trigger) => onChange(value.map((x, j) => (j === i ? trig : x)))
  const defaults: Record<Trigger['type'], Trigger> = {
    time: { type: 'time', at: '07:00', days: [] },
    sun: { type: 'sun', event: 'sunset', offset_minutes: 0, days: [] },
    device_state: { type: 'device_state', device_id: '', property: 'is_on', equals: true },
    power_above: { type: 'power_above', device_id: '', watts: 1000 },
    device_offline: { type: 'device_offline', device_id: '' },
    device_discovered: { type: 'device_discovered' },
  }
  return (
    <div className="flex flex-col gap-3">
      {value.map((trig, i) => (
        <Row key={i} onRemove={() => onChange(value.filter((_, j) => j !== i))}>
          <SelectField label={t('automations.when')} value={trig.type} onChange={(e) => set(i, defaults[e.target.value as Trigger['type']])}>
            <option value="time">{t('rule.trigger.time')}</option>
            <option value="sun">{t('rule.trigger.sun')}</option>
            <option value="device_state">{t('rule.trigger.deviceState')}</option>
            <option value="power_above">{t('rule.trigger.powerAbove')}</option>
            <option value="device_offline">{t('rule.trigger.deviceOffline')}</option>
            <option value="device_discovered">{t('rule.trigger.deviceDiscovered')}</option>
          </SelectField>
          {trig.type === 'time' && <Field label={t('rule.time')} type="time" value={trig.at} onChange={(e) => set(i, { ...trig, at: e.target.value })} />}
          {trig.type === 'sun' && <SunFields value={trig} onChange={(v) => set(i, v)} />}
          {(trig.type === 'time' || trig.type === 'sun') && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-label font-medium">
                {t('rule.days')} <span className="font-normal text-subtle">{t('rule.daysHint')}</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, n) => {
                  const on = trig.days.includes(n)
                  return (
                    <button
                      type="button"
                      key={d}
                      aria-pressed={on}
                      onClick={() => set(i, { ...trig, days: on ? trig.days.filter((x) => x !== n) : [...trig.days, n].sort() })}
                      className={cn('h-8 w-11 cursor-pointer rounded-md border text-label font-medium transition-colors', on ? 'border-fg bg-fg text-bg' : 'border-border text-muted hover:text-fg')}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
          {trig.type === 'device_state' && (
            <>
              <DeviceSelect value={trig.device_id} onChange={(id) => set(i, { ...trig, device_id: id })} />
              <StateCompare value={trig} onChange={(v) => set(i, v)} />
            </>
          )}
          {trig.type === 'power_above' && (
            <>
              <DeviceSelect value={trig.device_id} onChange={(id) => set(i, { ...trig, device_id: id })} filter={(d) => d.state.current_power_watts != null} />
              <Field label={t('rule.watts')} type="number" value={String(trig.watts)} onChange={(e) => set(i, { ...trig, watts: Number(e.target.value) })} />
            </>
          )}
          {trig.type === 'device_offline' && <DeviceSelect value={trig.device_id} onChange={(id) => set(i, { ...trig, device_id: id })} />}
        </Row>
      ))}
      <Button type="button" variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, defaults.time])} className="self-start">
        {t('rule.addTrigger')}
      </Button>
    </div>
  )
}

export function ConditionEditor({ value, onChange }: { value: Condition[]; onChange: (v: Condition[]) => void }) {
  const set = (i: number, c: Condition) => onChange(value.map((x, j) => (j === i ? c : x)))
  return (
    <div className="flex flex-col gap-3">
      {value.map((c, i) => (
        <Row key={i} onRemove={() => onChange(value.filter((_, j) => j !== i))}>
          <SelectField
            label={t('automations.onlyIf')}
            value={c.type}
            onChange={(e) =>
              set(i, e.target.value === 'time_between' ? { type: 'time_between', start: '22:00', end: '06:00' } : { type: 'device_state', device_id: '', property: 'is_on', equals: true })
            }
          >
            <option value="time_between">{t('rule.condition.timeBetween')}</option>
            <option value="device_state">{t('rule.condition.deviceState')}</option>
          </SelectField>
          {c.type === 'time_between' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('rule.from')} type="time" value={c.start} onChange={(e) => set(i, { ...c, start: e.target.value })} />
              <Field label={t('rule.to')} type="time" value={c.end} onChange={(e) => set(i, { ...c, end: e.target.value })} />
            </div>
          ) : (
            <>
              <DeviceSelect value={c.device_id} onChange={(id) => set(i, { ...c, device_id: id })} />
              <StateCompare value={c} onChange={(v) => set(i, v)} />
            </>
          )}
        </Row>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={<Plus size={14} />}
        onClick={() => onChange([...value, { type: 'time_between', start: '22:00', end: '06:00' }])}
        className="self-start"
      >
        {t('rule.addCondition')}
      </Button>
    </div>
  )
}

function CommandSelect({
  command,
  onCommand,
  targetDevice,
}: {
  command: DeviceCommand
  onCommand: (c: DeviceCommand) => void
  targetDevice?: Device
}) {
  const isLight =
    !targetDevice ||
    targetDevice.device_type === 'light' ||
    targetDevice.state.color != null ||
    targetDevice.state.color_temp != null ||
    targetDevice.state.brightness != null

  let kind = 'on'
  if (command.color) {
    kind = 'color'
  } else if (command.color_temp !== undefined) {
    kind = 'color_temp'
  } else if (command.brightness !== undefined) {
    kind = 'brightness'
  } else if (command.is_on === false) {
    kind = 'off'
  }

  const handleKindChange = (newKind: string) => {
    switch (newKind) {
      case 'on':
        onCommand({ is_on: true })
        break
      case 'off':
        onCommand({ is_on: false })
        break
      case 'brightness':
        onCommand({ is_on: true, brightness: command.brightness ?? 50 })
        break
      case 'color':
        onCommand({ is_on: true, color: command.color ?? '#F59E0B', color_mode: 'color' })
        break
      case 'color_temp':
        onCommand({ is_on: true, color_temp: command.color_temp ?? 50, color_mode: 'white' })
        break
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label={t('rule.do')} value={kind} onChange={(e) => handleKindChange(e.target.value)}>
          <option value="on">{t('confirmSwitch.turnOn')}</option>
          <option value="off">{t('confirmSwitch.turnOff')}</option>
          <option value="brightness">{t('rule.cmd.brightness')}</option>
          {isLight && <option value="color">{t('rule.cmd.color')}</option>}
          {isLight && <option value="color_temp">{t('rule.cmd.colorTemp')}</option>}
        </SelectField>

        {kind === 'brightness' && (
          <Field
            label={t('rule.brightnessPct')}
            type="number"
            min={1}
            max={100}
            value={String(command.brightness ?? 50)}
            onChange={(e) => onCommand({ is_on: true, brightness: Number(e.target.value) })}
          />
        )}

        {kind === 'color' && (
          <div className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted">{t('rule.lightColor')}</span>
            <div className="flex items-center gap-2">
              <label className="relative flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-raised px-2.5 hover:bg-raised/80">
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-white/20 shadow-sm"
                  style={{ backgroundColor: command.color ?? '#F59E0B' }}
                />
                <span className="font-mono text-caption uppercase text-fg">
                  {command.color ?? '#F59E0B'}
                </span>
                <input
                  type="color"
                  value={command.color?.startsWith('#') ? command.color.slice(0, 7) : '#F59E0B'}
                  onChange={(e) =>
                    onCommand({ is_on: true, color: e.target.value.toUpperCase(), color_mode: 'color' })
                  }
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={t('rule.colorPicker')}
                />
              </label>
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                {COLOR_PRESETS.slice(0, 5).map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    onClick={() => onCommand({ is_on: true, color: c.hex, color_mode: 'color' })}
                    className={cn(
                      'h-6 w-6 shrink-0 rounded-full border border-white/20 transition-transform hover:scale-110',
                      command.color?.toLowerCase() === c.hex.toLowerCase() && 'ring-2 ring-fg ring-offset-1 ring-offset-panel',
                    )}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {kind === 'color_temp' && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-caption">
              <span className="font-medium text-muted">{t('reading.temperature')}</span>
              <span className="text-subtle tabular">
                {Math.round(2000 + ((command.color_temp ?? 50) / 100) * 4500)}K ({command.color_temp ?? 50}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={command.color_temp ?? 50}
                onChange={(e) =>
                  onCommand({ is_on: true, color_temp: Number(e.target.value), color_mode: 'white' })
                }
                className="range flex-1"
                aria-label={t('light.tempSlider')}
              />
              <div className="flex shrink-0 items-center gap-1">
                {WHITE_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={t('rule.whitePresetTitle', { name: p.name, kelvin: p.kelvin })}
                    onClick={() => onCommand({ is_on: true, color_temp: p.pct, color_mode: 'white' })}
                    className={cn(
                      'h-5 w-5 shrink-0 rounded-full border border-white/30 transition-transform hover:scale-110',
                      Math.abs((command.color_temp ?? 50) - p.pct) <= 7 && 'ring-2 ring-fg ring-offset-1 ring-offset-panel',
                    )}
                    style={{ backgroundColor: p.hex }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ActionEditor({ value, onChange, allowScenes = true }: { value: Action[]; onChange: (v: Action[]) => void; allowScenes?: boolean }) {
  const { data: devices = [] } = useDevices()
  const { data: groups = [] } = useGroups()
  const { data: scenes = [] } = useScenes()
  const set = (i: number, a: Action) => onChange(value.map((x, j) => (j === i ? a : x)))
  const defaults: Record<Action['type'], Action> = {
    device_command: { type: 'device_command', device_id: '', command: { is_on: true } },
    group_command: { type: 'group_command', group_id: '', command: { is_on: true } },
    notify: { type: 'notify', title: '', message: '' },
    scene: { type: 'scene', scene_id: '' },
    delay: { type: 'delay', seconds: 60 },
  }
  return (
    <div className="flex flex-col gap-3">
      {value.map((a, i) => (
        <Row key={i} onRemove={() => onChange(value.filter((_, j) => j !== i))}>
          <SelectField label={t('automations.then')} value={a.type} onChange={(e) => set(i, defaults[e.target.value as Action['type']])}>
            <option value="device_command">{t('rule.actionType.device')}</option>
            <option value="group_command">{t('rule.actionType.group')}</option>
            <option value="notify">{t('rule.actionType.notify')}</option>
            {allowScenes && <option value="scene">{t('rule.actionType.scene')}</option>}
            <option value="delay">{t('rule.actionType.delay')}</option>
          </SelectField>
          {a.type === 'device_command' && (
            <>
              <DeviceSelect value={a.device_id} onChange={(id) => set(i, { ...a, device_id: id })} filter={(d) => d.device_type !== 'sensor'} />
              <div className="sm:col-span-2">
                <CommandSelect
                  command={a.command}
                  onCommand={(c) => set(i, { ...a, command: c })}
                  targetDevice={devices.find((d) => d.id === a.device_id)}
                />
              </div>
            </>
          )}
          {a.type === 'group_command' && (
            <>
              <SelectField label={t('overview.groupFallback')} value={a.group_id} onChange={(e) => set(i, { ...a, group_id: e.target.value })}>
                <option value="">{t('rule.choose')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </SelectField>
              <div className="sm:col-span-2">
                <CommandSelect command={a.command} onCommand={(c) => set(i, { ...a, command: c })} />
              </div>
            </>
          )}
          {a.type === 'notify' && (
            <>
              <Field label={t('rule.notifyTitle')} value={a.title} onChange={(e) => set(i, { ...a, title: e.target.value })} />
              <Field label={t('rule.notifyMessage')} value={a.message} onChange={(e) => set(i, { ...a, message: e.target.value })} className="sm:col-span-2" />
            </>
          )}
          {a.type === 'scene' && (
            <SelectField label={t('overview.sceneFallback')} value={a.scene_id} onChange={(e) => set(i, { ...a, scene_id: e.target.value })}>
              <option value="">{t('rule.choose')}</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          )}
          {a.type === 'delay' && (
            <Field label={t('rule.seconds')} type="number" min={1} value={String(a.seconds)} onChange={(e) => set(i, { ...a, seconds: Number(e.target.value) })} />
          )}
        </Row>
      ))}
      <Button type="button" variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, defaults.device_command])} className="self-start">
        {t('rule.addAction')}
      </Button>
    </div>
  )
}

/** Client-side check so incomplete rules are caught before saving. */
export function validateRule(triggers: Trigger[] | null, actions: Action[]): string | null {
  if (triggers && !triggers.length) return t('rule.err.noTrigger')
  if (!actions.length) return t('rule.err.noAction')
  if (triggers?.some((trig) => 'device_id' in trig && !trig.device_id)) return t('rule.err.triggerDevice')
  for (const a of actions) {
    if (a.type === 'device_command' && !a.device_id) return t('rule.err.actionDevice')
    if (a.type === 'group_command' && !a.group_id) return t('rule.err.actionGroup')
    if (a.type === 'scene' && !a.scene_id) return t('rule.err.actionScene')
    if (a.type === 'notify' && !a.title.trim()) return t('rule.err.notifyTitle')
  }
  return null
}
