import type { ReactNode } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { Field, SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { useDevices, useGroups, useScenes } from '@/lib/queries'
import { formatClockTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { COLOR_PRESETS, WHITE_PRESETS } from '@/components/devices/LightColorControls'
import type { Action, Condition, Device, DeviceCommand, Trigger } from '@/lib/types'

export const PROPERTIES: { value: string; label: string; kind: 'bool' | 'number' }[] = [
  { value: 'is_on', label: 'Power', kind: 'bool' },
  { value: 'is_online', label: 'Online', kind: 'bool' },
  { value: 'current_power_watts', label: 'Power draw (W)', kind: 'number' },
  { value: 'air_quality_pm25', label: 'PM2.5', kind: 'number' },
  { value: 'temperature', label: 'Temperature', kind: 'number' },
  { value: 'humidity', label: 'Humidity', kind: 'number' },
  { value: 'brightness', label: 'Brightness', kind: 'number' },
  { value: 'color_temp', label: 'Color temperature', kind: 'number' },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const deviceName = (devices: Device[], id: string) => devices.find((d) => d.id === id)?.name ?? 'a device'

function compareText(c: { equals?: unknown; above?: number; below?: number }, prop: string) {
  const p = PROPERTIES.find((x) => x.value === prop)
  if (c.equals !== undefined) {
    if (prop === 'is_on') return c.equals ? 'turns on' : 'turns off'
    if (prop === 'is_online') return c.equals ? 'comes online' : 'goes offline'
    return `${p?.label ?? prop} is ${String(c.equals)}`
  }
  if (c.above !== undefined) return `${p?.label ?? prop} rises above ${c.above}`
  if (c.below !== undefined) return `${p?.label ?? prop} drops below ${c.below}`
  return `${p?.label ?? prop} changes`
}

export function describeTrigger(t: Trigger, devices: Device[]): string {
  switch (t.type) {
    case 'time':
      return `At ${formatClockTime(t.at)}${t.days.length && t.days.length < 7 ? ` on ${t.days.map((d) => DAYS[d]).join(', ')}` : ' every day'}`
    case 'device_state':
      return `When ${deviceName(devices, t.device_id)} ${compareText(t, t.property)}`
    case 'power_above':
      return `When ${deviceName(devices, t.device_id)} draws over ${t.watts} W`
    case 'device_offline':
      return `When ${deviceName(devices, t.device_id)} goes offline`
    case 'device_discovered':
      return 'When a new device is found'
  }
}

export function describeAction(a: Action, devices: Device[], groups: { id: string; name: string }[], scenes: { id: string; name: string }[]): string {
  const cmd = (c: DeviceCommand) => {
    if (c.color) return `set color ${c.color}`
    if (c.color_temp !== undefined) return `set color temp ${c.color_temp}%`
    if (c.brightness !== undefined) return `set brightness ${c.brightness}%`
    return c.is_on ? 'turn on' : 'turn off'
  }
  switch (a.type) {
    case 'device_command':
      return `${cmd(a.command)} ${deviceName(devices, a.device_id)}`
    case 'group_command':
      return `${cmd(a.command)} ${groups.find((g) => g.id === a.group_id)?.name ?? 'group'}`
    case 'notify':
      return `notify “${a.title}”`
    case 'scene':
      return `run ${scenes.find((s) => s.id === a.scene_id)?.name ?? 'scene'}`
    case 'delay':
      return `wait ${a.seconds}s`
  }
}

function Row({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="relative rounded-lg border border-border bg-raised/40 p-4 pr-12">
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
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
    <SelectField label="Device" value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Choose…</option>
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
        label="Property"
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
        <SelectField label="Is" value={String(value.equals ?? true)} onChange={(e) => onChange({ ...base, equals: e.target.value === 'true' } as T)}>
          <option value="true">{prop.value === 'is_online' ? 'Online' : 'On'}</option>
          <option value="false">{prop.value === 'is_online' ? 'Offline' : 'Off'}</option>
        </SelectField>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Is"
            value={op}
            onChange={(e) => {
              const n = Number(value.above ?? value.below ?? value.equals ?? 0)
              onChange({ ...base, [e.target.value]: n } as T)
            }}
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
            <option value="equals">Equal to</option>
          </SelectField>
          <Field
            label="Value"
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

export function TriggerEditor({ value, onChange }: { value: Trigger[]; onChange: (v: Trigger[]) => void }) {
  const set = (i: number, t: Trigger) => onChange(value.map((x, j) => (j === i ? t : x)))
  const defaults: Record<Trigger['type'], Trigger> = {
    time: { type: 'time', at: '07:00', days: [] },
    device_state: { type: 'device_state', device_id: '', property: 'is_on', equals: true },
    power_above: { type: 'power_above', device_id: '', watts: 1000 },
    device_offline: { type: 'device_offline', device_id: '' },
    device_discovered: { type: 'device_discovered' },
  }
  return (
    <div className="flex flex-col gap-3">
      {value.map((t, i) => (
        <Row key={i} onRemove={() => onChange(value.filter((_, j) => j !== i))}>
          <SelectField label="When" value={t.type} onChange={(e) => set(i, defaults[e.target.value as Trigger['type']])}>
            <option value="time">At a time</option>
            <option value="device_state">A device changes</option>
            <option value="power_above">Power goes above</option>
            <option value="device_offline">A device goes offline</option>
            <option value="device_discovered">A new device is found</option>
          </SelectField>
          {t.type === 'time' && (
            <>
              <Field label="Time" type="time" value={t.at} onChange={(e) => set(i, { ...t, at: e.target.value })} />
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-label font-medium">Days <span className="font-normal text-subtle">(none selected = every day)</span></legend>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, n) => {
                    const on = t.days.includes(n)
                    return (
                      <button
                        type="button"
                        key={d}
                        aria-pressed={on}
                        onClick={() => set(i, { ...t, days: on ? t.days.filter((x) => x !== n) : [...t.days, n].sort() })}
                        className={cn('h-8 w-11 cursor-pointer rounded-md border text-label font-medium transition-colors', on ? 'border-fg bg-fg text-bg' : 'border-border text-muted hover:text-fg')}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </>
          )}
          {t.type === 'device_state' && (
            <>
              <DeviceSelect value={t.device_id} onChange={(id) => set(i, { ...t, device_id: id })} />
              <StateCompare value={t} onChange={(v) => set(i, v)} />
            </>
          )}
          {t.type === 'power_above' && (
            <>
              <DeviceSelect value={t.device_id} onChange={(id) => set(i, { ...t, device_id: id })} filter={(d) => d.state.current_power_watts != null} />
              <Field label="Watts" type="number" value={String(t.watts)} onChange={(e) => set(i, { ...t, watts: Number(e.target.value) })} />
            </>
          )}
          {t.type === 'device_offline' && <DeviceSelect value={t.device_id} onChange={(id) => set(i, { ...t, device_id: id })} />}
        </Row>
      ))}
      <Button type="button" variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, defaults.time])} className="self-start">
        Add trigger
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
            label="Only if"
            value={c.type}
            onChange={(e) =>
              set(i, e.target.value === 'time_between' ? { type: 'time_between', start: '22:00', end: '06:00' } : { type: 'device_state', device_id: '', property: 'is_on', equals: true })
            }
          >
            <option value="time_between">Time is between</option>
            <option value="device_state">A device is</option>
          </SelectField>
          {c.type === 'time_between' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" type="time" value={c.start} onChange={(e) => set(i, { ...c, start: e.target.value })} />
              <Field label="To" type="time" value={c.end} onChange={(e) => set(i, { ...c, end: e.target.value })} />
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
        Add condition
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
        <SelectField label="Do" value={kind} onChange={(e) => handleKindChange(e.target.value)}>
          <option value="on">Turn on</option>
          <option value="off">Turn off</option>
          <option value="brightness">Set brightness</option>
          {isLight && <option value="color">Set color</option>}
          {isLight && <option value="color_temp">Set color temperature</option>}
        </SelectField>

        {kind === 'brightness' && (
          <Field
            label="Brightness %"
            type="number"
            min={1}
            max={100}
            value={String(command.brightness ?? 50)}
            onChange={(e) => onCommand({ is_on: true, brightness: Number(e.target.value) })}
          />
        )}

        {kind === 'color' && (
          <div className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted">Light color</span>
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
                  aria-label="Color picker"
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
              <span className="font-medium text-muted">Temperature</span>
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
                aria-label="Color temperature slider"
              />
              <div className="flex shrink-0 items-center gap-1">
                {WHITE_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={`${p.name} (${p.kelvin}K)`}
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
          <SelectField label="Then" value={a.type} onChange={(e) => set(i, defaults[e.target.value as Action['type']])}>
            <option value="device_command">Control a device</option>
            <option value="group_command">Control a group</option>
            <option value="notify">Send a notification</option>
            {allowScenes && <option value="scene">Run a scene</option>}
            <option value="delay">Wait</option>
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
              <SelectField label="Group" value={a.group_id} onChange={(e) => set(i, { ...a, group_id: e.target.value })}>
                <option value="">Choose…</option>
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
              <Field label="Title" value={a.title} onChange={(e) => set(i, { ...a, title: e.target.value })} />
              <Field label="Message" value={a.message} onChange={(e) => set(i, { ...a, message: e.target.value })} className="sm:col-span-2" />
            </>
          )}
          {a.type === 'scene' && (
            <SelectField label="Scene" value={a.scene_id} onChange={(e) => set(i, { ...a, scene_id: e.target.value })}>
              <option value="">Choose…</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          )}
          {a.type === 'delay' && (
            <Field label="Seconds" type="number" min={1} value={String(a.seconds)} onChange={(e) => set(i, { ...a, seconds: Number(e.target.value) })} />
          )}
        </Row>
      ))}
      <Button type="button" variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => onChange([...value, defaults.device_command])} className="self-start">
        Add action
      </Button>
    </div>
  )
}

/** Client-side check so incomplete rules are caught before saving. */
export function validateRule(triggers: Trigger[] | null, actions: Action[]): string | null {
  if (triggers && !triggers.length) return 'Add at least one trigger'
  if (!actions.length) return 'Add at least one action'
  if (triggers?.some((t) => 'device_id' in t && !t.device_id)) return 'Choose a device for every trigger'
  for (const a of actions) {
    if (a.type === 'device_command' && !a.device_id) return 'Choose a device for every action'
    if (a.type === 'group_command' && !a.group_id) return 'Choose a group for every action'
    if (a.type === 'scene' && !a.scene_id) return 'Choose a scene for every action'
    if (a.type === 'notify' && !a.title.trim()) return 'Notifications need a title'
  }
  return null
}
