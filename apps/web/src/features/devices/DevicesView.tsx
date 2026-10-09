import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowCounterClockwise,
  MagnifyingGlass,
  Plus,
  Power,
  Broadcast,
  SquaresFour,
  Stack,
  Trash,
  PencilSimple,
  WarningCircle,
} from '@phosphor-icons/react'
import { PageHeader, EmptyState, Badge, Card, Skeleton, SectionTitle } from '@/components/Layout'
import { Button } from '@/components/Button'
import { Segmented, Switch } from '@/components/Controls'
import { DeviceTile } from '@/components/DeviceTile'
import { DeviceSheet } from '@/components/DeviceSheet'
import { Sheet, Confirm } from '@/components/Sheet'
import { Field, SelectField } from '@/components/Field'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useDiscovered, useGroups, useRooms } from '@/lib/queries'
import { deviceIcons, deviceTypeLabel, integrationLabel } from '@/lib/devices'
import { errorMessage, useToast } from '@/lib/toast'
import { timeAgo } from '@/lib/format'
import { stagger, rise } from '@/lib/motion'
import type { Discovered, DiscoverySettings, Group } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'

type Tab = 'mine' | 'discovered' | 'groups'

export function DevicesView() {
  const admin = useIsAdmin()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'mine'
  const { data: pending = [] } = useDiscovered('pending')
  const [manual, setManual] = useState(false)

  const tabs: { value: Tab; label: string }[] = [
    { value: 'mine', label: 'My devices' },
    ...(admin ? [{ value: 'discovered' as Tab, label: `Discovered${pending.length ? ` (${pending.length})` : ''}` }] : []),
    { value: 'groups', label: 'Groups' },
  ]

  return (
    <div>
      <PageHeader
        title="Devices"
        subtitle="Everything connected to your home"
        actions={
          admin && (
            <Button variant="glass" icon={<Plus size={18} />} onClick={() => setManual(true)}>
              Add by IP
            </Button>
          )
        }
      />
      <Segmented label="Device sections" value={tab} options={tabs} onChange={(v) => setParams(v === 'mine' ? {} : { tab: v })} className="mb-6" />
      {tab === 'mine' && <MyDevices />}
      {tab === 'discovered' && admin && <DiscoveredTab />}
      {tab === 'groups' && <GroupsTab />}
      <ManualAddSheet open={manual} onClose={() => setManual(false)} />
    </div>
  )
}

function MyDevices() {
  const { data: devices, isLoading } = useDevices()
  const { data: rooms = [] } = useRooms()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const list = (devices ?? []).filter((d) => `${d.name} ${d.model ?? ''} ${d.device_type}`.toLowerCase().includes(q.toLowerCase()))
  const selected = devices?.find((d) => d.id === open) ?? null

  // Group by room, unassigned last.
  const sections = useMemo(() => {
    const out = rooms.map((r) => ({ id: r.id, name: r.name, items: list.filter((d) => d.room_id === r.id) }))
    out.push({ id: 'none', name: 'No room', items: list.filter((d) => !d.room_id || !rooms.some((r) => r.id === d.room_id)) })
    return out.filter((s) => s.items.length)
  }, [list, rooms])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[148px]" />
        ))}
      </div>
    )
  }
  if (!devices?.length) {
    return (
      <EmptyState
        icon={<SquaresFour size={30} />}
        title="No devices yet"
        message="Link an account in Plugins or check the Discovered tab — Docus scans your network automatically."
      />
    )
  }
  return (
    <>
      <div className="relative mb-2 max-w-md">
        <MagnifyingGlass size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          aria-label="Search devices"
          placeholder="Search devices"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="glass-thin h-12 w-full rounded-2xl pl-12 pr-4 text-base placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </div>
      {sections.length === 0 && <p className="py-10 text-center text-muted">No devices match “{q}”.</p>}
      {sections.map((s) => (
        <section key={s.id} aria-label={s.name}>
          <SectionTitle>
            {s.name} <span className="ml-1 text-sm font-semibold text-subtle">{s.items.length}</span>
          </SectionTitle>
          <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {s.items.map((d) => (
              <DeviceTile key={d.id} device={d} onOpen={() => setOpen(d.id)} />
            ))}
          </motion.div>
        </section>
      ))}
      <DeviceSheet device={selected} onClose={() => setOpen(null)} />
    </>
  )
}

// --------------------------------------------------------------------------
// Discovery inbox
// --------------------------------------------------------------------------

function DiscoveredTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: pending = [], isLoading } = useDiscovered('pending')
  const { data: ignored = [] } = useDiscovered('ignored')
  const [adopting, setAdopting] = useState<Discovered | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)

  const scan = useMutation({
    mutationFn: api.scan,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['discovered'] })
      toast.push({
        tone: r.errors.length ? 'warning' : 'success',
        title: r.new ? `Found ${r.new} new ${r.new === 1 ? 'device' : 'devices'}` : 'Scan complete — nothing new',
        message: r.errors.map((e) => `${integrationLabel[e.integration] ?? e.integration}: ${e.message}`).join('\n') || undefined,
      })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Scan failed', message: errorMessage(e) }),
  })
  const ignore = useMutation({
    mutationFn: api.ignore,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discovered'] }),
  })
  const restore = useMutation({
    mutationFn: api.restore,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discovered'] }),
  })

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <DiscoverySettingsCard onScan={() => scan.mutate()} scanning={scan.isPending} />

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : pending.length === 0 ? (
        <EmptyState
          icon={<Broadcast size={30} />}
          title="No new devices"
          message="Docus listens on your network and checks linked accounts. New devices appear here as soon as they're found."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((d) => (
            <DiscoveredRow
              key={d.id}
              d={d}
              actions={
                <>
                  <Button variant="ghost" size="sm" onClick={() => ignore.mutate(d.id)}>
                    Ignore
                  </Button>
                  <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => setAdopting(d)}>
                    Add
                  </Button>
                </>
              }
            />
          ))}
        </ul>
      )}

      {ignored.length > 0 && (
        <div>
          <button onClick={() => setShowIgnored((v) => !v)} className="cursor-pointer text-sm font-semibold text-muted hover:text-fg" aria-expanded={showIgnored}>
            {showIgnored ? 'Hide' : 'Show'} {ignored.length} ignored
          </button>
          {showIgnored && (
            <ul className="mt-3 flex flex-col gap-3">
              {ignored.map((d) => (
                <DiscoveredRow
                  key={d.id}
                  d={d}
                  actions={
                    <Button variant="ghost" size="sm" icon={<ArrowCounterClockwise size={16} />} onClick={() => restore.mutate(d.id)}>
                      Restore
                    </Button>
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}
      <AdoptSheet item={adopting} onClose={() => setAdopting(null)} />
    </motion.div>
  )
}

function DiscoveredRow({ d, actions }: { d: Discovered; actions: React.ReactNode }) {
  const Icon = deviceIcons[d.device_type]
  return (
    <motion.li variants={rise} layout className="surface flex flex-wrap items-center gap-4 rounded-4xl p-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-line/[0.08] text-muted">
        <Icon size={24} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{d.name}</p>
          <Badge tone="info">{integrationLabel[d.integration_type] ?? d.integration_type}</Badge>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          {[deviceTypeLabel[d.device_type], d.model, d.ip_address].filter(Boolean).join(' · ')} · found {timeAgo(d.discovered_at)}
        </p>
        {d.note && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-warn">
            <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {d.note}
          </p>
        )}
      </div>
      <div className="flex gap-2">{actions}</div>
    </motion.li>
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
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Broadcast size={26} weight="fill" aria-hidden />
            {data?.enabled && <span className="absolute inset-0 animate-ping rounded-2xl bg-accent/20 motion-reduce:animate-none" aria-hidden />}
          </span>
          <div>
            <p className="font-bold">Automatic discovery</p>
            <p className="text-sm text-muted">
              {data?.enabled ? `Scanning every ${data.interval_minutes} min` : 'Background scanning is off'}
            </p>
          </div>
        </div>
        <Button variant="primary" icon={<Broadcast size={18} />} loading={scanning} onClick={onScan}>
          {scanning ? 'Scanning…' : 'Scan now'}
        </Button>
      </div>
      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleRow label="Scan in the background" hint="Find new devices on your network and linked accounts" checked={data.enabled} onChange={(v) => update({ enabled: v })} />
          <ToggleRow label="Add new devices automatically" hint="Skip the inbox; you'll get a notification" checked={data.auto_adopt} onChange={(v) => update({ auto_adopt: v })} />
          <ToggleRow label="Notify me" hint="Send a notification when something new is found" checked={data.notify} onChange={(v) => update({ notify: v })} />
          <div className="flex items-center justify-between gap-3 rounded-3xl bg-line/[0.04] p-4">
            <div>
              <p className="font-semibold">Scan interval</p>
              <p className="text-sm text-muted">Minutes between scans</p>
            </div>
            <Segmented
              size="sm"
              label="Scan interval"
              value={String(data.interval_minutes)}
              options={['2', '5', '15', '60'].map((v) => ({ value: v, label: `${v}m` }))}
              onChange={(v) => update({ interval_minutes: Number(v) })}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-3xl bg-line/[0.04] p-4">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

function AdoptSheet({ item, onClose }: { item: Discovered | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: rooms = [] } = useRooms()
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const needsToken = item?.integration_type === 'xiaomi' && !!item.note

  const adopt = useMutation({
    mutationFn: () => api.adopt(item!.id, { name: name || undefined, room_id: roomId || undefined, token: token || undefined }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: keys.devices })
      qc.invalidateQueries({ queryKey: ['discovered'] })
      toast.push({ tone: 'success', title: `${d.name} added` })
      close()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const close = () => {
    setName('')
    setRoomId('')
    setToken('')
    setError(null)
    onClose()
  }

  return (
    <Sheet
      open={!!item}
      onClose={close}
      title={`Add ${item?.name ?? 'device'}`}
      description={item ? `${integrationLabel[item.integration_type] ?? item.integration_type}${item.ip_address ? ` · ${item.ip_address}` : ''}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={adopt.isPending} onClick={() => adopt.mutate()} disabled={needsToken && token.length !== 32}>
            Add device
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), adopt.mutate())}>
        <Field label="Name" placeholder={item?.name} value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">No room</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        {needsToken && (
          <Field
            label="Device token"
            required
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            hint="32 hex characters. Easiest: link your Xiaomi account in Plugins and tokens are fetched for you."
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {item?.note && !needsToken && <p className="rounded-2xl bg-warn/10 p-3 text-sm text-warn">{item.note}</p>}
        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  )
}

function ManualAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: rooms = [] } = useRooms()
  const [integration, setIntegration] = useState('tapo')
  const [host, setHost] = useState('')
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: () =>
      api.addManual({
        integration_type: integration,
        host,
        token: integration === 'xiaomi' ? token : undefined,
        name: name || undefined,
        room_id: roomId || undefined,
      }),
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
      description="For devices discovery can't reach, e.g. on another subnet or VLAN."
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
        <Segmented
          label="Integration"
          value={integration}
          options={[
            { value: 'tapo', label: 'Tapo' },
            { value: 'xiaomi', label: 'Xiaomi' },
          ]}
          onChange={setIntegration}
        />
        <Field label="IP address" required inputMode="decimal" placeholder="192.168.1.50" value={host} onChange={(e) => setHost(e.target.value.trim())} />
        {integration === 'xiaomi' && (
          <Field label="Device token" required value={token} onChange={(e) => setToken(e.target.value.trim())} hint="32 hex characters" spellCheck={false} />
        )}
        {integration === 'tapo' && <p className="text-sm text-muted">Uses the TP-Link account linked in Plugins.</p>}
        <Field label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">No room</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  )
}

// --------------------------------------------------------------------------
// Groups
// --------------------------------------------------------------------------

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
    onSuccess: (r) => {
      if (r.failed.length) toast.push({ tone: 'warning', title: `${r.failed.length} device(s) did not respond` })
    },
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
    <motion.div variants={stagger} initial="hidden" animate="show">
      {admin && (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEditing('new')}>
            New group
          </Button>
        </div>
      )}
      {groups.length === 0 ? (
        <EmptyState icon={<Stack size={30} />} title="No groups" message="Group devices — like all downstairs lights — to switch them together." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const members = devices.filter((d) => g.device_ids.includes(d.id))
            const anyOn = members.some((d) => d.state.is_on)
            return (
              <Card key={g.id} className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{g.name}</p>
                    <p className="truncate text-sm text-muted">{members.map((m) => m.name).join(', ') || 'No devices'}</p>
                  </div>
                  {admin && (
                    <div className="flex">
                      <Button variant="ghost" size="sm" aria-label={`Edit ${g.name}`} icon={<PencilSimple size={18} />} onClick={() => setEditing(g)} />
                      <Button variant="ghost" size="sm" aria-label={`Delete ${g.name}`} icon={<Trash size={18} />} onClick={() => setDeleting(g)} />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant={anyOn ? 'glass' : 'primary'} size="sm" icon={<Power size={16} />} disabled={!control || !members.length} onClick={() => command.mutate({ id: g.id, on: true })}>
                    All on
                  </Button>
                  <Button variant="glass" size="sm" disabled={!control || !members.length} onClick={() => command.mutate({ id: g.id, on: false })}>
                    All off
                  </Button>
                  <span className="ml-auto self-center text-sm text-muted">
                    {members.filter((d) => d.state.is_on).length}/{members.length} on
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <GroupSheet group={editing} onClose={() => setEditing(null)} />
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        message="The devices stay; only the group is removed."
      />
    </motion.div>
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
  const toggle = (id: string) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

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
        <Field label="Group name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="All lights" />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-muted">Devices ({ids.length})</legend>
          <div className="flex flex-col gap-1">
            {devices.map((d) => {
              const Icon = deviceIcons[d.device_type]
              return (
                <label key={d.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 hover:bg-line/[0.05]">
                  <input type="checkbox" checked={ids.includes(d.id)} onChange={() => toggle(d.id)} className="h-5 w-5 accent-[rgb(var(--accent))]" />
                  <Icon size={20} className="text-muted" aria-hidden />
                  <span className="flex-1">{d.name}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>
    </Sheet>
  )
}
