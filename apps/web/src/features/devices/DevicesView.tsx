import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Broadcast, MagnifyingGlass, PencilSimple, Plus, SquaresFour, Stack, Trash, WarningCircle } from '@phosphor-icons/react'
import { Badge, Card, CardHeader, EmptyState, ErrorText, PageHeader, Skeleton } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Segmented, Switch } from '@/components/ui/Controls'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Checkbox, Field, SelectField, inputCls } from '@/components/ui/Field'
import { DeviceRow } from '@/components/devices/DeviceRow'
import { DeviceDrawer } from '@/components/devices/DeviceDrawer'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useDiscovered, useGroups, useRooms } from '@/lib/queries'
import { deviceIcons, deviceTypeLabel, integrationLabel } from '@/lib/devices'
import { errorMessage, useToast } from '@/lib/toast'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Discovered, DiscoverySettings, Group } from '@/lib/types'

type Tab = 'all' | 'discovered' | 'groups'

export function DevicesView() {
  const admin = useIsAdmin()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'all'
  const { data: pending = [] } = useDiscovered('pending')
  const [manual, setManual] = useState(false)
  const tabs: { value: Tab; label: string }[] = [
    { value: 'all', label: 'All devices' },
    ...(admin ? [{ value: 'discovered' as Tab, label: pending.length ? `Discovered · ${pending.length}` : 'Discovered' }] : []),
    { value: 'groups', label: 'Groups' },
  ]
  return (
    <>
      <PageHeader
        title="Devices"
        description="Everything connected to your home."
        actions={admin && <Button icon={<Plus size={16} />} onClick={() => setManual(true)}>Add by IP</Button>}
      />
      <Segmented label="Sections" value={tab} options={tabs} onChange={(v) => setParams(v === 'all' ? {} : { tab: v })} className="mb-6" />
      {tab === 'all' && <AllDevices />}
      {tab === 'discovered' && admin && <DiscoveredTab />}
      {tab === 'groups' && <GroupsTab />}
      <ManualAddSheet open={manual} onClose={() => setManual(false)} />
    </>
  )
}

function AllDevices() {
  const { data: devices, isLoading } = useDevices()
  const { data: rooms = [] } = useRooms()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const list = (devices ?? []).filter((d) => `${d.name} ${d.model ?? ''} ${deviceTypeLabel[d.device_type]}`.toLowerCase().includes(q.trim().toLowerCase()))
  const sections = useMemo(() => {
    const out = rooms.map((r) => ({ id: r.id, name: r.name, items: list.filter((d) => d.room_id === r.id) }))
    out.push({ id: 'none', name: 'Unassigned', items: list.filter((d) => !d.room_id || !rooms.some((r) => r.id === d.room_id)) })
    return out.filter((s) => s.items.length)
  }, [list, rooms])

  if (isLoading) return <Skeleton className="h-64" />
  if (!devices?.length) {
    return <EmptyState icon={<SquaresFour size={28} />} title="No devices" message="Link an integration or check Discovered — Domus scans your network automatically." />
  }
  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <input type="search" aria-label="Search devices" placeholder="Search devices" value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputCls, 'pl-9')} />
      </div>
      {sections.length === 0 && <p className="py-10 text-center text-muted">No devices match “{q}”.</p>}
      <div className="flex flex-col gap-6">
        {sections.map((s) => (
          <Card key={s.id}>
            <CardHeader title={`${s.name} · ${s.items.length}`} />
            <ul className="divide-y divide-border">
              {s.items.map((d) => (
                <DeviceRow key={d.id} device={d} onOpen={() => setOpen(d.id)} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <DeviceDrawer device={devices.find((d) => d.id === open) ?? null} onClose={() => setOpen(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function DiscoveredTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: pending = [], isLoading } = useDiscovered('pending')
  const { data: ignored = [] } = useDiscovered('ignored')
  const [adopting, setAdopting] = useState<Discovered | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['discovered'] })

  const scan = useMutation({
    mutationFn: api.scan,
    onSuccess: (r) => {
      refresh()
      toast.push({
        tone: r.errors.length ? 'warning' : 'success',
        title: r.new ? `${r.new} new ${r.new === 1 ? 'device' : 'devices'} found` : 'Scan complete. Nothing new.',
        message: r.errors.map((e) => `${integrationLabel[e.integration] ?? e.integration}: ${e.message}`).join('\n') || undefined,
      })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Scan failed', message: errorMessage(e) }),
  })
  const ignore = useMutation({ mutationFn: api.ignore, onSuccess: refresh })
  const restore = useMutation({ mutationFn: api.restore, onSuccess: refresh })

  return (
    <div className="flex flex-col gap-6">
      <DiscoverySettingsCard onScan={() => scan.mutate()} scanning={scan.isPending} />
      <Card>
        <CardHeader title={`Waiting to be added · ${pending.length}`} />
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-12" />
          </div>
        ) : pending.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted">No new devices. They appear here as soon as they are found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((d) => (
              <DiscoveredRow
                key={d.id}
                d={d}
                actions={
                  <>
                    <Button variant="ghost" size="sm" onClick={() => ignore.mutate(d.id)}>
                      Ignore
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => setAdopting(d)}>
                      Add
                    </Button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </Card>
      {ignored.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" aria-expanded={showIgnored} onClick={() => setShowIgnored((v) => !v)}>
            {showIgnored ? 'Hide' : 'Show'} ignored ({ignored.length})
          </Button>
          {showIgnored && (
            <Card className="mt-2">
              <ul className="divide-y divide-border">
                {ignored.map((d) => (
                  <DiscoveredRow key={d.id} d={d} actions={<Button size="sm" onClick={() => restore.mutate(d.id)}>Restore</Button>} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      <AdoptSheet item={adopting} onClose={() => setAdopting(null)} />
    </div>
  )
}

function DiscoveredRow({ d, actions }: { d: Discovered; actions: React.ReactNode }) {
  const Icon = deviceIcons[d.device_type]
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Icon size={18} className="shrink-0 text-subtle" aria-hidden />
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body font-medium">{d.name}</span>
          <Badge>{integrationLabel[d.integration_type] ?? d.integration_type}</Badge>
        </div>
        <p className="truncate text-label text-muted">
          {[deviceTypeLabel[d.device_type], d.model, d.ip_address].filter(Boolean).join(' · ')} · found {timeAgo(d.discovered_at)}
        </p>
        {d.note && (
          <p className="mt-1 flex items-start gap-1.5 text-label text-warn">
            <WarningCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {d.note}
          </p>
        )}
      </div>
      <div className="flex gap-2">{actions}</div>
    </li>
  )
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
      <div>
        <p className="text-body">{label}</p>
        <p className="text-label text-muted">{hint}</p>
      </div>
      {children}
    </div>
  )
}

function DiscoverySettingsCard({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: keys.discoverySettings, queryFn: api.discoverySettings })
  const save = useMutation({
    mutationFn: api.saveDiscoverySettings,
    onSuccess: (s) => qc.setQueryData(keys.discoverySettings, s),
    onError: (e) => toast.push({ tone: 'error', title: 'Could not save', message: errorMessage(e) }),
  })
  const update = (patch: Partial<DiscoverySettings>) => data && save.mutate({ ...data, ...patch })
  return (
    <Card>
      <CardHeader
        title="Automatic discovery"
        action={
          <Button size="sm" icon={<Broadcast size={16} />} loading={scanning} onClick={onScan}>
            Scan now
          </Button>
        }
      />
      {data ? (
        <div className="divide-y divide-border">
          <SettingRow label="Scan in the background" hint="Look for new devices on the network and in linked accounts.">
            <Switch checked={data.enabled} onChange={(v) => update({ enabled: v })} label="Scan in the background" />
          </SettingRow>
          <SettingRow label="Scan interval" hint="Time between background scans.">
            <Segmented size="sm" label="Scan interval" value={String(data.interval_minutes)} options={['2', '5', '15', '60'].map((v) => ({ value: v, label: `${v} min` }))} onChange={(v) => update({ interval_minutes: Number(v) })} />
          </SettingRow>
          <SettingRow label="Add new devices automatically" hint="Skip review. You still get a notification.">
            <Switch checked={data.auto_adopt} onChange={(v) => update({ auto_adopt: v })} label="Add new devices automatically" />
          </SettingRow>
          <SettingRow label="Notify on new devices" hint="Send a notification when something new is found.">
            <Switch checked={data.notify} onChange={(v) => update({ notify: v })} label="Notify on new devices" />
          </SettingRow>
        </div>
      ) : (
        <div className="p-4">
          <Skeleton className="h-40" />
        </div>
      )}
    </Card>
  )
}

function RoomSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: rooms = [] } = useRooms()
  return (
    <SelectField label="Room" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No room</option>
      {rooms.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </SelectField>
  )
}

function AdoptSheet({ item, onClose }: { item: Discovered | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const needsToken = item?.integration_type === 'xiaomi' && !!item.note
  const close = () => {
    setName('')
    setRoomId('')
    setToken('')
    setError(null)
    onClose()
  }
  const adopt = useMutation({
    mutationFn: () => api.adopt(item!.id, { name: name || undefined, room_id: roomId || undefined, token: token || undefined }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: keys.devices })
      qc.invalidateQueries({ queryKey: keys.rooms })
      qc.invalidateQueries({ queryKey: ['discovered'] })
      toast.push({ tone: 'success', title: `${d.name} added` })
      close()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Sheet
      open={!!item}
      onClose={close}
      title={`Add ${item?.name ?? 'device'}`}
      description={item ? [integrationLabel[item.integration_type] ?? item.integration_type, item.model, item.ip_address].filter(Boolean).join(' · ') : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={adopt.isPending} disabled={needsToken && token.length !== 32} onClick={() => adopt.mutate()}>
            Add device
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), adopt.mutate())}>
        <Field label="Name" placeholder={item?.name} value={name} onChange={(e) => setName(e.target.value)} />
        <RoomSelect value={roomId} onChange={setRoomId} />
        {needsToken && (
          <Field label="Device token" required spellCheck={false} autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} hint="32 hex characters. Linking your Xiaomi account fetches tokens automatically." />
        )}
        {item?.note && !needsToken && <p className="text-label text-warn">{item.note}</p>}
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  )
}

function ManualAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [integration, setIntegration] = useState('tapo')
  const [host, setHost] = useState('')
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: () => api.addManual({ integration_type: integration, host, token: integration === 'xiaomi' ? token : undefined, name: name || undefined, room_id: roomId || undefined }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: keys.devices })
      toast.push({ tone: 'success', title: `${d.name} added` })
      setHost('')
      setToken('')
      setName('')
      setError(null)
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add device by IP"
      description="For devices that discovery cannot reach, such as another subnet or VLAN."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} disabled={!host || (integration === 'xiaomi' && token.length !== 32)} onClick={() => add.mutate()}>
            Connect
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
        <Segmented label="Integration" value={integration} options={[{ value: 'tapo', label: 'Tapo' }, { value: 'xiaomi', label: 'Xiaomi' }]} onChange={setIntegration} className="self-start" />
        <Field label="IP address" required inputMode="decimal" placeholder="192.168.1.50" value={host} onChange={(e) => setHost(e.target.value.trim())} />
        {integration === 'xiaomi' ? (
          <Field label="Device token" required spellCheck={false} value={token} onChange={(e) => setToken(e.target.value.trim())} hint="32 hex characters." />
        ) : (
          <p className="text-label text-muted">Uses the TP-Link account linked under Integrations.</p>
        )}
        <Field label="Name" hint="Optional." value={name} onChange={(e) => setName(e.target.value)} />
        <RoomSelect value={roomId} onChange={setRoomId} />
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

function GroupsTab() {
  const admin = useIsAdmin()
  const control = useCanControl()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: groups = [], isLoading } = useGroups()
  const { data: devices = [] } = useDevices()
  const [editing, setEditing] = useState<Group | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const command = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.groupCommand(id, { is_on: on }),
    onSuccess: (r) => r.failed.length && toast.push({ tone: 'warning', title: `${r.failed.length} device(s) did not respond` }),
    onError: (e) => toast.push({ tone: 'error', title: 'Group command failed', message: errorMessage(e) }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.removeGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.groups })
      setDeleting(null)
    },
  })
  if (isLoading) return <Skeleton className="h-32" />
  return (
    <>
      {groups.length === 0 ? (
        <EmptyState
          icon={<Stack size={28} />}
          title="No groups"
          message="Group devices, such as all downstairs lights, to switch them together."
          action={admin && <Button variant="primary" onClick={() => setEditing('new')}>New group</Button>}
        />
      ) : (
        <Card>
          <CardHeader title={`Groups · ${groups.length}`} action={admin && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New group</Button>} />
          <ul className="divide-y divide-border">
            {groups.map((g) => {
              const members = devices.filter((d) => g.device_ids.includes(d.id))
              const on = members.filter((d) => d.state.is_on && d.is_online).length
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-body font-medium">{g.name}</p>
                    <p className="truncate text-label text-muted">
                      {on}/{members.length} on · {members.map((m) => m.name).join(', ') || 'No devices'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" disabled={!control || !members.length} onClick={() => command.mutate({ id: g.id, on: true })}>
                      On
                    </Button>
                    <Button size="sm" disabled={!control || !members.length} onClick={() => command.mutate({ id: g.id, on: false })}>
                      Off
                    </Button>
                    {admin && (
                      <>
                        <Button variant="ghost" size="sm" aria-label={`Edit ${g.name}`} icon={<PencilSimple size={16} />} onClick={() => setEditing(g)} />
                        <Button variant="ghost" size="sm" aria-label={`Delete ${g.name}`} icon={<Trash size={16} />} onClick={() => setDeleting(g)} />
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      <GroupSheet group={editing} onClose={() => setEditing(null)} />
      <Confirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending} title={`Delete ${deleting?.name}?`} message="The devices are kept. Only the group is removed." />
    </>
  )
}

function GroupSheet({ group, onClose }: { group: Group | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: devices = [] } = useDevices()
  const existing = group && group !== 'new' ? group : null
  const [name, setName] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const [key, setKey] = useState<string | null>(null)
  const current = existing?.id ?? (group === 'new' ? 'new' : null)
  if (current !== key) {
    setKey(current)
    setName(existing?.name ?? '')
    setIds(existing?.device_ids ?? [])
  }
  const save = useMutation({
    mutationFn: async () => {
      if (existing) await api.updateGroup(existing.id, { name, device_ids: ids })
      else await api.createGroup({ name, device_ids: ids })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.groups })
      toast.push({ tone: 'success', title: 'Group saved' })
      onClose()
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not save group', message: errorMessage(e) }),
  })
  const toggle = (id: string) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  return (
    <Sheet
      open={!!group}
      onClose={onClose}
      title={existing ? 'Edit group' : 'New group'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required placeholder="All lights" value={name} onChange={(e) => setName(e.target.value)} />
        <fieldset>
          <legend className="mb-2 text-label font-medium">Devices · {ids.length} selected</legend>
          <div className="-mx-2 flex flex-col">
            {devices.map((d) => (
              <Checkbox key={d.id} checked={ids.includes(d.id)} onChange={() => toggle(d.id)}>
                <span className="text-body">{d.name}</span>
                <span className="ml-auto text-label text-subtle">{deviceTypeLabel[d.device_type]}</span>
              </Checkbox>
            ))}
          </div>
        </fieldset>
      </div>
    </Sheet>
  )
}
