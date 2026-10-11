import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretDown, CaretRight, DiceFive, PencilSimple, Plus, Sparkle, Trash } from '@phosphor-icons/react'
import { Badge, Card, CardHeader, ErrorText, PageHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Segmented, Switch } from '@/components/ui/Controls'
import { Field, SelectField } from '@/components/ui/Field'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { AvatarPickerModal } from '@/components/ui/AvatarPickerModal'
import { rollRandomAvatar, parseAvatarSpec } from '@/lib/avatar'
import { api, desktop, type UpdateChannel } from '@/lib/api'
import { useAuth, useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useRooms, useServerLinks } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/cn'
import type { Device, Role, Room, User } from '@/lib/types'

const roleHelp: Record<Role, string> = {
  admin: 'Full access, including devices, integrations, people and settings.',
  member: 'Can see what they are given. Control, or edit to also rename a device, is set per room and device.',
  guest: 'Can view the rooms and devices they are given, but not control them.',
}

export function SettingsView() {
  const { user, updateUser } = useAuth()
  const admin = useIsAdmin()
  const [theme, setTheme] = useTheme()
  const toast = useToast()
  const qc = useQueryClient()
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [rolling, setRolling] = useState(false)

  const parsedAvatar = parseAvatarSpec(user?.avatar, user?.username || 'user')

  const changeAvatarMutation = useMutation({
    mutationFn: (newAvatar: string) => api.updateAvatar(newAvatar),
    onSuccess: (updated) => {
      updateUser(updated)
      qc.invalidateQueries({ queryKey: keys.users })
      toast.push({ tone: 'success', title: 'Avatar updated' })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not update avatar', message: errorMessage(e) }),
  })

  const handleQuickRoll = async () => {
    setRolling(true)
    const rolled = rollRandomAvatar(parsedAvatar.style)
    try {
      await changeAvatarMutation.mutateAsync(rolled.spec)
    } finally {
      setTimeout(() => setRolling(false), 200)
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          {/* Avatar Profile Section */}
          <div className="flex items-center gap-4 px-4 py-3.5 bg-raised/30 border-b border-border">
            <div className="relative group">
              <Avatar
                avatar={user?.avatar}
                username={user?.username}
                size="lg"
                interactive
                onClick={() => setAvatarModalOpen(true)}
                className="ring-2 ring-primary/40 group-hover:ring-primary group-hover:scale-105 transition-all"
              />
              <button
                type="button"
                onClick={() => setAvatarModalOpen(true)}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Change avatar"
              >
                <PencilSimple size={18} />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg text-body truncate">{user?.username}</span>
                <Badge tone="neutral">{user?.role}</Badge>
              </div>
              <p className="text-caption text-muted truncate mt-0.5">
                DiceBear {parsedAvatar.style} · seed: {parsedAvatar.seed}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                icon={<DiceFive size={16} className={rolling ? 'animate-spin' : ''} />}
                onClick={handleQuickRoll}
                title="Roll a random avatar"
                disabled={changeAvatarMutation.isPending}
              >
                Roll
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Sparkle size={14} />}
                onClick={() => setAvatarModalOpen(true)}
              >
                Customize
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border">
            <div className="flex min-h-12 items-center justify-between px-4">
              <span className="text-muted">Username</span>
              <span>{user?.username}</span>
            </div>
            <div className="flex min-h-12 items-center justify-between px-4">
              <span className="text-muted">Email</span>
              <span className="truncate">{user?.email || '—'}</span>
            </div>
            <div className="flex min-h-12 items-center justify-between px-4">
              <span className="text-muted">Role</span>
              <Badge>{user?.role}</Badge>
            </div>
          </div>
        </Card>
        <AvatarPickerModal
          open={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          currentAvatar={user?.avatar}
          username={user?.username}
          onSave={async (newAvatar) => {
            await changeAvatarMutation.mutateAsync(newAvatar)
          }}
        />
        <Card>
          <CardHeader title="Appearance" />
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
            <div>
              <p>Theme</p>
              <p className="text-label text-muted">System follows your device setting.</p>
            </div>
            <Segmented size="sm" label="Theme" value={theme} onChange={setTheme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
        </Card>
        <PasswordCard />
        <ServerCard />
        <AboutCard />
      </div>
      {admin && <People />}
    </>
  )
}

function PasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const change = useMutation({
    mutationFn: () => api.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      toast.push({ tone: 'success', title: 'Password changed' })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not change password', message: errorMessage(e) }),
  })
  return (
    <Card>
      <CardHeader title="Password" />
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          change.mutate()
        }}
      >
        <Field label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field label="New password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} />
        <Button type="submit" loading={change.isPending} disabled={!current || next.length < 8} className="self-start">
          Update password
        </Button>
      </form>
    </Card>
  )
}

const channels: { value: UpdateChannel; label: string }[] = [
  { value: 'stable', label: 'Stable' },
  { value: 'beta', label: 'Beta' },
  { value: 'alpha', label: 'Alpha' },
]

/** The web UI's version, and in the desktop app its own release channel and updates. */
function AboutCard() {
  const toast = useToast()
  const qc = useQueryClient()
  const updates = desktop?.updates
  const { data: info } = useQuery({ queryKey: ['desktop-update-info'], queryFn: () => updates!.info(), enabled: !!updates })
  const check = useQuery({ queryKey: ['desktop-update', info?.channel], queryFn: () => updates!.check(), enabled: !!info, retry: false })
  const install = useMutation({
    mutationFn: () => updates!.install(),
    onSuccess: (failed) => failed && toast.push({ tone: 'error', title: 'Update failed', message: failed }),
  })
  const setChannel = async (channel: UpdateChannel) => {
    await updates!.setChannel(channel)
    qc.invalidateQueries({ queryKey: ['desktop-update-info'] })
  }
  return (
    <Card>
      <CardHeader title="About" />
      <div className="divide-y divide-border">
        <Link to="/about" className="flex min-h-12 items-center justify-between px-4 transition-colors duration-fast hover:bg-raised">
          <span>About Domus</span>
          <CaretRight size={16} className="text-subtle" aria-hidden />
        </Link>
        <div className="flex min-h-12 items-center justify-between px-4">
          <span className="text-muted">Version</span>
          <span>
            {__APP_VERSION__} <span className="text-subtle">(build {__APP_BUILD__})</span>
          </span>
        </div>
        {info && (
          <>
            <div className="flex min-h-12 items-center justify-between px-4">
              <span className="text-muted">Desktop app</span>
              <span>{info.version}</span>
            </div>
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
              <div>
                <p>Update channel</p>
                <p className="text-label text-muted">Beta and Alpha get new builds earlier, and every stable one.</p>
              </div>
              <Segmented size="sm" label="Update channel" value={info.channel} onChange={setChannel} options={channels} />
            </div>
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
              <p>{check.isFetching ? 'Checking for updates…' : check.isError ? "Couldn't check for updates" : check.data ? `Domus ${check.data.version} is available` : 'Up to date'}</p>
              {check.data ? (
                <Button size="sm" loading={install.isPending} onClick={() => install.mutate()}>
                  {info.selfInstall ? 'Update and restart' : 'Download'}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" disabled={check.isFetching} onClick={() => check.refetch()}>
                  Check now
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function ServerCard() {
  const admin = useIsAdmin()
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useServerLinks()
  const [form, setForm] = useState<{ local_url: string; remote_url: string } | null>(null)
  const value = form ?? { local_url: data?.local_url ?? '', remote_url: data?.remote_url ?? '' }
  const save = useMutation({
    mutationFn: () => api.saveServerLinks(value),
    onSuccess: (links) => {
      qc.setQueryData(keys.serverLinks, links)
      setForm(null)
      toast.push({ tone: 'success', title: 'Server addresses saved', message: 'The apps pick them up the next time they open.' })
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not save', message: errorMessage(e) }),
  })
  return (
    <Card>
      <CardHeader title="Server addresses" action={desktop && <Button size="sm" onClick={() => desktop?.chooseServer()}>Change server</Button>} />
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <p className="text-label text-muted">The apps use the home address on your network and the remote one everywhere else, without signing in again.</p>
        <Field label="Home network" placeholder="https://192.168.1.10:8443" disabled={!admin} value={value.local_url} onChange={(e) => setForm({ ...value, local_url: e.target.value })} />
        <Field label="Remote" placeholder="https://home.example.com" hint="For example a Cloudflare Tunnel hostname." disabled={!admin} value={value.remote_url} onChange={(e) => setForm({ ...value, remote_url: e.target.value })} />
        {admin && (
          <Button type="submit" loading={save.isPending} disabled={!form} className="self-start">
            Save addresses
          </Button>
        )}
      </form>
    </Card>
  )
}

function People() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: users = [] } = useQuery({ queryKey: keys.users, queryFn: api.users })
  const { data: rooms = [] } = useRooms()
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const remove = useMutation({
    mutationFn: (id: string) => api.removeUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.users })
      setDeleting(null)
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not remove', message: errorMessage(e) }),
  })
  return (
    <Card className="mt-6">
      <CardHeader title={`People and access · ${users.length}`} action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Add person</Button>} />
      <ul className="divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <Avatar avatar={u.avatar} username={u.username} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">
                {u.username}
                {u.id === me?.id && <span className="font-normal text-subtle"> (you)</span>}
              </p>
              <p className="truncate text-label text-muted">
                {accessSummary(u, rooms)}
              </p>
            </div>
            <Badge tone={u.role === 'admin' ? 'info' : 'neutral'}>{u.role}</Badge>
            <Button variant="ghost" size="sm" aria-label={`Edit ${u.username}`} icon={<PencilSimple size={16} />} onClick={() => setEditing(u)} />
            {u.id !== me?.id && <Button variant="ghost" size="sm" aria-label={`Remove ${u.username}`} icon={<Trash size={16} />} onClick={() => setDeleting(u)} />}
          </li>
        ))}
      </ul>
      <UserSheet user={editing} onClose={() => setEditing(null)} />
      <Confirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending} title={`Remove ${deleting?.username}?`} message="They lose access immediately." confirmLabel="Remove" />
    </Card>
  )
}

function accessSummary(u: User, rooms: Room[]) {
  if (u.role === 'admin' || u.all_rooms) return 'Whole home'
  const parts = u.room_ids.flatMap((id) => {
    const name = rooms.find((r) => r.id === id)?.name
    return name ? [u.view_only_room_ids.includes(id) ? `${name} (see only)` : name] : []
  })
  if (u.device_ids.length) parts.push(`${u.device_ids.length} ${u.device_ids.length === 1 ? 'device' : 'devices'}`)
  return parts.join(', ') || 'No access'
}

type Level = 'none' | 'view' | 'control' | 'edit'
/** Granted ids and their level; an id that is missing has no access. */
type Levels = Record<string, Exclude<Level, 'none'>>
const levelOptions: { value: Level; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'view', label: 'See only' },
  { value: 'control', label: 'Control' },
  { value: 'edit', label: 'Edit' },
]
const toLevels = (ids: string[], viewOnly: string[], edit: string[]): Levels =>
  Object.fromEntries(ids.map((id) => [id, viewOnly.includes(id) ? 'view' : edit.includes(id) ? 'edit' : 'control']))
const without = (levels: Levels, ids: string[]): Levels => Object.fromEntries(Object.entries(levels).filter(([id]) => !ids.includes(id)))
const idsAt = (levels: Levels, level: Level) => Object.keys(levels).filter((id) => levels[id] === level)

/** One line of the access editor: what it is on the left, its level in a compact menu on the right. */
function AccessRow({ label, hint, value, onChange }: { label: string; hint?: string; value: Level; onChange: (v: Level) => void }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2 pl-9 pr-3">
      <div className="min-w-0">
        <p className="truncate">{label}</p>
        {hint && <p className="text-caption text-subtle">{hint}</p>}
      </div>
      <div className="relative shrink-0">
        <select
          aria-label={`Access to ${label}`}
          value={value}
          onChange={(e) => onChange(e.target.value as Level)}
          className={cn(
            'h-8 cursor-pointer appearance-none rounded-md border border-border bg-raised pl-2.5 pr-7 text-label transition-colors duration-fast focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-fg/15',
            value === 'none' ? 'text-muted' : 'font-medium text-fg',
          )}
        >
          {levelOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <CaretDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
      </div>
    </div>
  )
}

/** One room in the access editor: grant it whole, or set single devices (which also override the room). */
function RoomAccess({ name, devices, room, levelOf, onRoom, onDevice }: { name: string; devices: Device[]; room?: Level; levelOf: (d: Device) => Level; onRoom?: (v: Level) => void; onDevice: (id: string, v: Level) => void }) {
  const count = devices.filter((d) => levelOf(d) !== 'none').length
  const status = room && room !== 'none' ? `Whole room · ${levelOptions.find((o) => o.value === room)?.label.toLowerCase()}` : count ? `${count} of ${devices.length} devices` : 'No access'
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 hover:bg-raised [&::-webkit-details-marker]:hidden">
        <CaretRight size={14} className="shrink-0 text-subtle transition-transform duration-base group-open:rotate-90" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className={cn('shrink-0 text-label', count || (room && room !== 'none') ? 'text-fg' : 'text-muted')}>{status}</span>
      </summary>
      <div className="divide-y divide-border border-t border-border">
        {onRoom && <AccessRow label="Whole room" hint="Also covers devices added later" value={room ?? 'none'} onChange={onRoom} />}
        {devices.map((d) => (
          <AccessRow key={d.id} label={d.name} value={levelOf(d)} onChange={(v) => onDevice(d.id, v)} />
        ))}
        {devices.length === 0 && <p className="py-3 pl-9 pr-3 text-label text-muted">No devices in this room yet.</p>}
      </div>
    </details>
  )
}

type EmailStatus = 'idle' | 'checking' | 'free' | 'taken'

/** Looks the address up shortly after typing stops. An empty address, or the account's own, needs no check. */
function useEmailStatus(email: string, userId?: string, own?: string): EmailStatus {
  const [state, setState] = useState<{ email: string; status: 'free' | 'taken' } | null>(null)
  const value = email.trim()
  const skip = !value.includes('@') || value === own
  useEffect(() => {
    if (skip) return
    let live = true
    const timer = setTimeout(() => {
      api.emailAvailable(value, userId).then((r) => live && setState({ email: value, status: r.available ? 'free' : 'taken' })).catch(() => {})
    }, 400)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [value, userId, skip])
  if (skip) return 'idle'
  return state?.email === value ? state.status : 'checking'
}

function UserSheet({ user, onClose }: { user: User | 'new' | null; onClose: () => void }) {
  const { user: me, updateUser } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: rooms = [] } = useRooms()
  const { data: devices = [] } = useDevices()
  const existing = user && user !== 'new' ? user : null
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'member' as Role,
    avatar: '',
    all_rooms: true,
    rooms: {} as Levels,
    devices: {} as Levels,
  })
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const emailStatus = useEmailStatus(form.email, existing?.id, existing?.email)
  const name = (existing?.username ?? form.username).trim()
  const generate = useMutation({
    mutationFn: () => api.suggestEmail(name, existing?.id),
    onSuccess: (r) => setForm((f) => ({ ...f, email: r.email })),
    onError: (e) => setError(errorMessage(e)),
  })
  const current = existing?.id ?? (user === 'new' ? 'new' : null)
  if (current !== key) {
    setKey(current)
    setError(null)
    setForm({
      username: existing?.username ?? '',
      email: existing?.email ?? '',
      password: '',
      role: existing?.role ?? 'member',
      avatar: existing?.avatar ?? `dicebear:bottts:${existing?.username || 'member'}`,
      all_rooms: existing?.all_rooms ?? true,
      rooms: toLevels(existing?.room_ids ?? [], existing?.view_only_room_ids ?? [], existing?.edit_room_ids ?? []),
      devices: toLevels(existing?.device_ids ?? [], existing?.view_only_device_ids ?? [], existing?.edit_device_ids ?? []),
    })
  }
  const save = useMutation({
    mutationFn: async () => {
      const { rooms: roomLevels, devices: deviceLevels, ...account } = form
      const grants = { room_ids: Object.keys(roomLevels), device_ids: Object.keys(deviceLevels), view_only_room_ids: idsAt(roomLevels, 'view'), view_only_device_ids: idsAt(deviceLevels, 'view'), edit_room_ids: idsAt(roomLevels, 'edit'), edit_device_ids: idsAt(deviceLevels, 'edit') }
      if (existing) {
        const updated = await api.updateUser(existing.id, {
          email: form.email,
          role: form.role,
          avatar: form.avatar,
          all_rooms: form.all_rooms,
          ...grants,
          ...(form.password ? { password: form.password } : {}),
        })
        if (existing.id === me?.id) {
          updateUser(updated)
        }
      } else {
        await api.createUser({ ...account, ...grants })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.users })
      toast.push({ tone: 'success', title: existing ? 'Access updated' : `${form.username} added` })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const inRoom = (id: string | null) => devices.filter((d) => (d.room_id ?? null) === id)
  const levelOf = (d: Device): Level => form.devices[d.id] ?? (d.room_id ? form.rooms[d.room_id] : undefined) ?? 'none'
  // Setting the whole room starts it clean: single-device settings in it are dropped.
  const setRoom = (id: string, level: Level) =>
    setForm((f) => ({
      ...f,
      rooms: level === 'none' ? without(f.rooms, [id]) : { ...f.rooms, [id]: level },
      devices: without(f.devices, inRoom(id).map((d) => d.id)),
    }))
  const setDevice = (roomId: string | null, id: string, level: Level) =>
    setForm((f) => {
      const room = roomId ? f.rooms[roomId] : undefined
      const rest = without(f.devices, [id])
      // Taking one device out of a whole room keeps the others, each at the room's level.
      if (level === 'none' && roomId && room) {
        const kept = Object.fromEntries(inRoom(roomId).filter((d) => d.id !== id && !rest[d.id]).map((d) => [d.id, room]))
        return { ...f, rooms: without(f.rooms, [roomId]), devices: { ...rest, ...kept } }
      }
      // The same level as the room needs no entry of its own.
      return { ...f, devices: level === 'none' || level === room ? rest : { ...rest, [id]: level } }
    })

  const handleRollAvatar = () => {
    const rolled = rollRandomAvatar()
    setForm((f) => ({ ...f, avatar: rolled.spec }))
  }

  return (
    <>
      <Sheet
        open={!!user}
        onClose={onClose}
        title={existing ? `Edit ${existing.username}` : 'Add person'}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={emailStatus === 'taken' || (!existing && (!form.username || form.password.length < 8))} onClick={() => save.mutate()}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Avatar row */}
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-raised/30 p-3">
            <Avatar avatar={form.avatar} username={form.username || 'User'} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-label font-medium text-fg">Avatar</p>
              <p className="truncate text-caption text-muted">DiceBear profile avatar</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" icon={<DiceFive size={16} />} onClick={handleRollAvatar}>
                Roll
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarModalOpen(true)}>
                Pick
              </Button>
            </div>
          </div>

          {!existing && <Field label="Username" required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />}
          <div className="flex items-start gap-2">
            <Field
              label="Email"
              type="email"
              className="min-w-0 flex-1"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={emailStatus === 'taken' ? 'Already used by another account' : undefined}
              hint={emailStatus === 'free' ? 'Available' : emailStatus === 'checking' ? 'Checking...' : 'Type one, or generate it from the username.'}
            />
            <Button type="button" className="mt-[26px]" loading={generate.isPending} disabled={name.length < 3} onClick={() => generate.mutate()}>
              Generate
            </Button>
          </div>
          <Field label={existing ? 'New password' : 'Password'} type="password" autoComplete="new-password" required={!existing} hint={existing ? 'Leave empty to keep the current password.' : 'At least 8 characters.'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <SelectField label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} hint={roleHelp[form.role]}>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="guest">Guest</option>
          </SelectField>
          {form.role !== 'admin' && (
            <section className="flex flex-col gap-2" aria-label="Access">
              <p className="text-label font-medium text-fg">Access</p>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">Custom access</p>
                  <p className="mt-0.5 text-label text-muted">{form.all_rooms ? 'Off: they reach the whole home.' : 'Set a level for each room, or for single devices in it.'}</p>
                </div>
                <Switch checked={!form.all_rooms} onChange={(v) => setForm({ ...form, all_rooms: !v })} label="Custom access" />
              </div>
              {!form.all_rooms && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="sr-only">Rooms and devices</legend>
                  {rooms.length === 0 && devices.length === 0 && <p className="rounded-lg border border-border p-3 text-label text-muted">Create rooms first.</p>}
                  {rooms.map((r) => (
                    <RoomAccess key={r.id} name={r.name} devices={inRoom(r.id)} room={form.rooms[r.id]} levelOf={levelOf} onRoom={(v) => setRoom(r.id, v)} onDevice={(id, v) => setDevice(r.id, id, v)} />
                  ))}
                  {inRoom(null).length > 0 && <RoomAccess name="No room" devices={inRoom(null)} levelOf={levelOf} onDevice={(id, v) => setDevice(null, id, v)} />}
                </fieldset>
              )}
            </section>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      </Sheet>
      <AvatarPickerModal
        open={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        currentAvatar={form.avatar}
        username={form.username || 'user'}
        onSave={(newAvatar) => setForm((f) => ({ ...f, avatar: newAvatar }))}
      />
    </>
  )
}
