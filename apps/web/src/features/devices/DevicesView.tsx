import { t } from '@/lib/i18n'
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
    { value: 'all', label: t('devices.tab.all') },
    ...(admin ? [{ value: 'discovered' as Tab, label: pending.length ? t('devices.tab.discoveredCount', { count: pending.length }) : t('devices.tab.discovered') }] : []),
    { value: 'groups', label: t('devices.tab.groups') },
  ]
  return (
    <>
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={admin && <Button icon={<Plus size={16} />} onClick={() => setManual(true)}>{t('devices.addByIp')}</Button>}
      />
      <Segmented label={t('devices.sections')} value={tab} options={tabs} onChange={(v) => setParams(v === 'all' ? {} : { tab: v })} className="mb-6" />
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
    out.push({ id: 'none', name: t('devices.unassigned'), items: list.filter((d) => !d.room_id || !rooms.some((r) => r.id === d.room_id)) })
    return out.filter((s) => s.items.length)
  }, [list, rooms])

  if (isLoading) return <Skeleton className="h-64" />
  if (!devices?.length) {
    return <EmptyState icon={<SquaresFour size={28} />} title={t('devices.empty.title')} message={t('devices.empty.message')} />
  }
  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <MagnifyingGlass size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
        <input type="search" aria-label={t('devices.search')} placeholder={t('devices.search')} value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputCls, 'ps-9')} />
      </div>
      {sections.length === 0 && <p className="py-10 text-center text-muted">{t('devices.noMatch', { query: q })}</p>}
      <div className="flex flex-col gap-6">
        {sections.map((s) => (
          <Card key={s.id}>
            <CardHeader title={t('devices.sectionTitle', { name: s.name, count: s.items.length })} />
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
        title: r.new ? t('discovery.newFound', { count: r.new }) : t('discovery.nothingNew'),
        message: r.errors.map((e) => `${integrationLabel[e.integration] ?? e.integration}: ${e.message}`).join('\n') || undefined,
      })
    },
    onError: (e) => toast.push({ tone: 'error', title: t('discovery.scanFailed'), message: errorMessage(e) }),
  })
  const ignore = useMutation({ mutationFn: api.ignore, onSuccess: refresh })
  const restore = useMutation({ mutationFn: api.restore, onSuccess: refresh })

  return (
    <div className="flex flex-col gap-6">
      <DiscoverySettingsCard onScan={() => scan.mutate()} scanning={scan.isPending} />
      <Card>
        <CardHeader title={t('discovery.waiting', { count: pending.length })} />
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-12" />
          </div>
        ) : pending.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted">{t('discovery.none')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((d) => (
              <DiscoveredRow
                key={d.id}
                d={d}
                actions={
                  <>
                    <Button variant="ghost" size="sm" onClick={() => ignore.mutate(d.id)}>
                      {t('discovery.ignore')}
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => setAdopting(d)}>
                      {t('discovery.add')}
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
            {t(showIgnored ? 'discovery.hideIgnored' : 'discovery.showIgnored', { count: ignored.length })}
          </Button>
          {showIgnored && (
            <Card className="mt-2">
              <ul className="divide-y divide-border">
                {ignored.map((d) => (
                  <DiscoveredRow key={d.id} d={d} actions={<Button size="sm" onClick={() => restore.mutate(d.id)}>{t('discovery.restore')}</Button>} />
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
          {t('discovery.found', { info: [deviceTypeLabel[d.device_type], d.model, d.ip_address].filter(Boolean).join(' · '), when: timeAgo(d.discovered_at) })}
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
    onError: (e) => toast.push({ tone: 'error', title: t('discovery.saveFailed'), message: errorMessage(e) }),
  })
  const update = (patch: Partial<DiscoverySettings>) => data && save.mutate({ ...data, ...patch })
  return (
    <Card>
      <CardHeader
        title={t('discovery.auto.title')}
        action={
          <Button size="sm" icon={<Broadcast size={16} />} loading={scanning} onClick={onScan}>
            {t('discovery.scanNow')}
          </Button>
        }
      />
      {data ? (
        <div className="divide-y divide-border">
          <SettingRow label={t('discovery.bg.label')} hint={t('discovery.bg.hint')}>
            <Switch checked={data.enabled} onChange={(v) => update({ enabled: v })} label={t('discovery.bg.label')} />
          </SettingRow>
          <SettingRow label={t('discovery.interval.label')} hint={t('discovery.interval.hint')}>
            <Segmented size="sm" label={t('discovery.interval.label')} value={String(data.interval_minutes)} options={['2', '5', '15', '60'].map((v) => ({ value: v, label: t('discovery.interval.min', { value: v }) }))} onChange={(v) => update({ interval_minutes: Number(v) })} />
          </SettingRow>
          <SettingRow label={t('discovery.autoAdd.label')} hint={t('discovery.autoAdd.hint')}>
            <Switch checked={data.auto_adopt} onChange={(v) => update({ auto_adopt: v })} label={t('discovery.autoAdd.label')} />
          </SettingRow>
          <SettingRow label={t('discovery.notify.label')} hint={t('discovery.notify.hint')}>
            <Switch checked={data.notify} onChange={(v) => update({ notify: v })} label={t('discovery.notify.label')} />
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
    <SelectField label={t('common.room')} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('devices.noRoom')}</option>
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
      toast.push({ tone: 'success', title: t('devices.added', { name: d.name }) })
      close()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Sheet
      open={!!item}
      onClose={close}
      title={t('devices.addTitle', { name: item?.name ?? t('devices.addTitleFallback') })}
      description={item ? [integrationLabel[item.integration_type] ?? item.integration_type, item.model, item.ip_address].filter(Boolean).join(' · ') : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={adopt.isPending} disabled={needsToken && token.length !== 32} onClick={() => adopt.mutate()}>
            {t('devices.addDevice')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), adopt.mutate())}>
        <Field label={t('common.name')} placeholder={item?.name} value={name} onChange={(e) => setName(e.target.value)} />
        <RoomSelect value={roomId} onChange={setRoomId} />
        {needsToken && (
          <Field label={t('devices.token')} required spellCheck={false} autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} hint={t('devices.token.hintXiaomi')} />
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
      toast.push({ tone: 'success', title: t('devices.added', { name: d.name }) })
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
      title={t('devices.manual.title')}
      description={t('devices.manual.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={add.isPending} disabled={!host || (integration === 'xiaomi' && token.length !== 32)} onClick={() => add.mutate()}>
            {t('devices.manual.connect')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
        <Segmented label={t('devices.manual.integration')} value={integration} options={[{ value: 'tapo', label: t('integration.tapo') }, { value: 'xiaomi', label: t('integration.xiaomi') }]} onChange={setIntegration} className="self-start" />
        <Field label={t('devices.manual.ip')} required inputMode="decimal" placeholder="192.168.1.50" value={host} onChange={(e) => setHost(e.target.value.trim())} />
        {integration === 'xiaomi' ? (
          <Field label={t('devices.token')} required spellCheck={false} value={token} onChange={(e) => setToken(e.target.value.trim())} hint={t('devices.token.hint')} />
        ) : (
          <p className="text-label text-muted">{t('devices.manual.tapoNote')}</p>
        )}
        <Field label={t('common.name')} hint={t('devices.optional')} value={name} onChange={(e) => setName(e.target.value)} />
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
    onSuccess: (r) => r.failed.length && toast.push({ tone: 'warning', title: t('groups.noResponse', { count: r.failed.length }) }),
    onError: (e) => toast.push({ tone: 'error', title: t('groups.commandFailed'), message: errorMessage(e) }),
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
          title={t('groups.empty.title')}
          message={t('groups.empty.message')}
          action={admin && <Button variant="primary" onClick={() => setEditing('new')}>{t('groups.new')}</Button>}
        />
      ) : (
        <Card>
          <CardHeader title={t('groups.count', { count: groups.length })} action={admin && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>{t('groups.new')}</Button>} />
          <ul className="divide-y divide-border">
            {groups.map((g) => {
              const members = devices.filter((d) => g.device_ids.includes(d.id))
              const on = members.filter((d) => d.state.is_on && d.is_online).length
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-body font-medium">{g.name}</p>
                    <p className="truncate text-label text-muted">
                      {t('groups.summary', { on, total: members.length, members: members.map((m) => m.name).join(', ') || t('groups.noDevices') })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" disabled={!control || !members.length} onClick={() => command.mutate({ id: g.id, on: true })}>
                      {t('groups.on')}
                    </Button>
                    <Button size="sm" disabled={!control || !members.length} onClick={() => command.mutate({ id: g.id, on: false })}>
                      {t('groups.off')}
                    </Button>
                    {admin && (
                      <>
                        <Button variant="ghost" size="sm" aria-label={t('groups.edit', { name: g.name })} icon={<PencilSimple size={16} />} onClick={() => setEditing(g)} />
                        <Button variant="ghost" size="sm" aria-label={t('groups.delete', { name: g.name })} icon={<Trash size={16} />} onClick={() => setDeleting(g)} />
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
      <Confirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending} title={t('groups.deleteTitle', { name: deleting?.name ?? '' })} message={t('groups.deleteMessage')} />
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
      toast.push({ tone: 'success', title: t('groups.saved') })
      onClose()
    },
    onError: (e) => toast.push({ tone: 'error', title: t('groups.saveFailed'), message: errorMessage(e) }),
  })
  const toggle = (id: string) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  return (
    <Sheet
      open={!!group}
      onClose={onClose}
      title={existing ? t('groups.editTitle') : t('groups.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('common.name')} required placeholder={t('groups.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <fieldset>
          <legend className="mb-2 text-label font-medium">{t('groups.devicesSelected', { count: ids.length })}</legend>
          <div className="-mx-2 flex flex-col">
            {devices.map((d) => (
              <Checkbox key={d.id} checked={ids.includes(d.id)} onChange={() => toggle(d.id)}>
                <span className="text-body">{d.name}</span>
                <span className="ms-auto text-label text-subtle">{deviceTypeLabel[d.device_type]}</span>
              </Checkbox>
            ))}
          </div>
        </fieldset>
      </div>
    </Sheet>
  )
}
