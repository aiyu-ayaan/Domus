import { t } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretDown, CaretRight, Check, Copy, DiceFive, PencilSimple, Plus, ShareNetwork, Sparkle, Trash } from '@phosphor-icons/react'
import { Badge, Card, CardHeader, ErrorText, Notice, PageHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Segmented, Switch } from '@/components/ui/Controls'
import { Field, SelectField } from '@/components/ui/Field'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { AvatarPickerModal } from '@/components/ui/AvatarPickerModal'
import { useDesktopUpdate } from '@/components/UpdatePrompt'
import { rollRandomAvatar, parseAvatarSpec } from '@/lib/avatar'
import { api, desktop } from '@/lib/api'
import { useAuth, useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useHomeLocation, useRooms, useServerLinks } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { formatTime } from '@/lib/format'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/cn'
import type { Device, Role, Room, User } from '@/lib/types'

const roleHelp: Record<Role, string> = {
  admin: t('settings.role.admin.help'),
  member: t('settings.role.member.help'),
  guest: t('settings.role.guest.help'),
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
      toast.push({ tone: 'success', title: t('settings.avatarUpdated') })
    },
    onError: (e) => toast.push({ tone: 'error', title: t('settings.avatarFailed'), message: errorMessage(e) }),
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
      <PageHeader title={t('settings.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('settings.account')} />
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
                title={t('settings.changeAvatar')}
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
                {t('settings.avatarStyle', { style: parsedAvatar.style, seed: parsedAvatar.seed })}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                icon={<DiceFive size={16} className={rolling ? 'animate-spin' : ''} />}
                onClick={handleQuickRoll}
                title={t('settings.rollAvatar')}
                disabled={changeAvatarMutation.isPending}
              >
                {t('settings.roll')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Sparkle size={14} />}
                onClick={() => setAvatarModalOpen(true)}
              >
                {t('settings.customize')}
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border">
            <div className="flex min-h-12 items-center justify-between px-4">
              <span className="text-muted">{t('settings.username')}</span>
              <span>{user?.username}</span>
            </div>
            <div className="flex min-h-12 items-center justify-between px-4">
              <span className="text-muted">{t('settings.email')}</span>
              <span className="truncate">{user?.email || '—'}</span>
            </div>
            <div className="flex min-h-12 items-center justify-between px-4">
              <span className="text-muted">{t('settings.roleLabel')}</span>
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
          <CardHeader title={t('settings.appearance')} />
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
            <div>
              <p>{t('settings.theme')}</p>
              <p className="text-label text-muted">{t('settings.theme.help')}</p>
            </div>
            <Segmented size="sm" label={t('settings.theme')} value={theme} onChange={setTheme} options={[{ value: 'system', label: t('settings.theme.system') }, { value: 'light', label: t('settings.theme.light') }, { value: 'dark', label: t('settings.theme.dark') }]} />
          </div>
        </Card>
        <PasswordCard />
        <ServerCard />
        <LocationCard />
        <BackupCard />
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
      toast.push({ tone: 'success', title: t('settings.password.changed') })
    },
    onError: (e) => toast.push({ tone: 'error', title: t('settings.password.failed'), message: errorMessage(e) }),
  })
  return (
    <Card>
      <CardHeader title={t('settings.password.title')} />
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          change.mutate()
        }}
      >
        <Field label={t('settings.password.current')} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field label={t('settings.password.new')} type="password" autoComplete="new-password" required minLength={8} hint={t('auth.atLeast8')} value={next} onChange={(e) => setNext(e.target.value)} />
        <Button type="submit" loading={change.isPending} disabled={!current || next.length < 8} className="self-start">
          {t('settings.password.update')}
        </Button>
      </form>
    </Card>
  )
}

/** The web UI's version and the way to the Updates page, which holds the channel, the update and the release notes. */
function AboutCard() {
  const { info, check } = useDesktopUpdate()
  return (
    <Card>
      <CardHeader title={t('settings.about')} />
      <div className="divide-y divide-border">
        <Link to="/about" className="flex min-h-12 items-center justify-between px-4 transition-colors duration-fast hover:bg-raised">
          <span>{t('settings.aboutDomus')}</span>
          <CaretRight size={16} className="text-subtle" aria-hidden />
        </Link>
        <Link to="/updates" className="flex min-h-12 items-center justify-between gap-3 px-4 transition-colors duration-fast hover:bg-raised">
          <span>{t('settings.updates')}</span>
          <span className="flex items-center gap-2 text-muted">
            {check.data ? t('update.available', { version: check.data.version }) : t('settings.releaseNotes')}
            <CaretRight size={16} className="text-subtle" aria-hidden />
          </span>
        </Link>
        <div className="flex min-h-12 items-center justify-between px-4">
          <span className="text-muted">{t('settings.version')}</span>
          <span>
            {__APP_VERSION__} <span className="text-subtle">{t('settings.build', { build: __APP_BUILD__ })}</span>
          </span>
        </div>
        {info && (
          <div className="flex min-h-12 items-center justify-between px-4">
            <span className="text-muted">{t('settings.desktopApp')}</span>
            <span>{info.version}</span>
          </div>
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
      toast.push({ tone: 'success', title: t('settings.server.saved'), message: t('settings.server.savedHint') })
    },
    onError: (e) => toast.push({ tone: 'error', title: t('discovery.saveFailed'), message: errorMessage(e) }),
  })
  return (
    <Card>
      <CardHeader title={t('settings.server.title')} action={desktop && <Button size="sm" onClick={() => desktop?.chooseServer()}>{t('auth.changeServer')}</Button>} />
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <p className="text-label text-muted">{t('settings.server.explain')}</p>
        <Field label={t('settings.server.home')} placeholder="https://192.168.1.10:8443" disabled={!admin} value={value.local_url} onChange={(e) => setForm({ ...value, local_url: e.target.value })} />
        <Field label={t('settings.server.remote')} placeholder="https://home.example.com" hint={t('settings.server.remoteHint')} disabled={!admin} value={value.remote_url} onChange={(e) => setForm({ ...value, remote_url: e.target.value })} />
        {admin && (
          <Button type="submit" loading={save.isPending} disabled={!form} className="self-start">
            {t('settings.server.save')}
          </Button>
        )}
      </form>
    </Card>
  )
}

function LocationCard() {
  const admin = useIsAdmin()
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useHomeLocation()
  const [form, setForm] = useState<{ latitude: string; longitude: string } | null>(null)
  const value = form ?? { latitude: data?.latitude?.toString() ?? '', longitude: data?.longitude?.toString() ?? '' }
  const save = useMutation({
    mutationFn: () => api.saveHomeLocation({ latitude: Number(value.latitude), longitude: Number(value.longitude) }),
    onSuccess: (place) => {
      qc.setQueryData(keys.homeLocation, place)
      setForm(null)
    },
    onError: (e) => toast.push({ tone: 'error', title: t('discovery.saveFailed'), message: errorMessage(e) }),
  })
  const [query, setQuery] = useState('')
  const search = useMutation({
    mutationFn: () => api.searchPlaces(query),
    onError: (e) => toast.push({ tone: 'error', title: t('settings.location.searchFailed'), message: errorMessage(e) }),
  })
  const locate = () =>
    navigator.geolocation.getCurrentPosition(
      // Two decimals is about a kilometre: enough for the sun, and not the address.
      (p) => setForm({ latitude: p.coords.latitude.toFixed(2), longitude: p.coords.longitude.toFixed(2) }),
      () => toast.push({ tone: 'error', title: t('settings.location.readFailed'), message: t('settings.location.readFailedHint') }),
    )
  const filled = value.latitude.trim() !== '' && value.longitude.trim() !== '' && !Number.isNaN(Number(value.latitude)) && !Number.isNaN(Number(value.longitude))
  return (
    <Card>
      {/* Electron has no location service of its own, so the desktop app offers the search only. */}
      <CardHeader title={t('settings.location.title')} action={admin && !desktop && <Button size="sm" onClick={locate}>{t('settings.location.useDevice')}</Button>} />
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <p className="text-label text-muted">
          {data?.sunrise && data.sunset
            ? t('settings.location.sun', { rise: formatTime(data.sunrise), set: formatTime(data.sunset) })
            : t('settings.location.sunUnknown')}
        </p>
        {admin && (
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-3">
              <Field
                label={t('settings.location.find')}
                placeholder={t('settings.location.place')}
                className="flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (query.trim().length >= 2) search.mutate()
                }}
              />
              <Button loading={search.isPending} disabled={query.trim().length < 2} onClick={() => search.mutate()}>
                {t('settings.location.search')}
              </Button>
            </div>
            {search.data &&
              (search.data.length ? (
                <ul className="flex flex-col rounded-md border border-border">
                  {search.data.map((p) => (
                    <li key={`${p.name}${p.latitude}${p.longitude}`} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-label transition-colors hover:bg-raised"
                        onClick={() => {
                          setForm({ latitude: String(p.latitude), longitude: String(p.longitude) })
                          search.reset()
                        }}
                      >
                        <span className="text-fg">{p.name}</span>
                        <span className="tabular-nums text-subtle">
                          {p.latitude}, {p.longitude}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-label text-muted">{t('settings.location.none')}</p>
              ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.location.lat')} inputMode="decimal" placeholder="18.52" disabled={!admin} value={value.latitude} onChange={(e) => setForm({ ...value, latitude: e.target.value })} />
          <Field label={t('settings.location.lon')} inputMode="decimal" placeholder="73.86" disabled={!admin} value={value.longitude} onChange={(e) => setForm({ ...value, longitude: e.target.value })} />
        </div>
        {admin && (
          <Button type="submit" loading={save.isPending} disabled={!form || !filled} className="self-start">
            {t('settings.location.save')}
          </Button>
        )}
      </form>
    </Card>
  )
}

function BackupCard() {
  const admin = useIsAdmin()
  const toast = useToast()
  const backup = useMutation({
    mutationFn: api.downloadBackup,
    onError: (e) => toast.push({ tone: 'error', title: t('settings.backup.failed'), message: errorMessage(e) }),
  })
  if (!admin) return null
  return (
    <Card>
      <CardHeader title={t('settings.backup.title')} />
      <div className="flex flex-col gap-4 p-4">
        <p className="text-label text-muted">
          {t('settings.backup.explain')}{' '}<code className="text-fg">domus-backend restore</code>.
        </p>
        <Button loading={backup.isPending} onClick={() => backup.mutate()} className="self-start">
          {t('settings.backup.download')}
        </Button>
      </div>
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
    onError: (e) => toast.push({ tone: 'error', title: t('settings.people.removeFailed'), message: errorMessage(e) }),
  })
  return (
    <Card className="mt-6">
      <CardHeader title={t('settings.people.title', { count: users.length })} action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>{t('settings.people.add')}</Button>} />
      <ul className="divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <Avatar avatar={u.avatar} username={u.username} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">
                {u.username}
                {u.id === me?.id && <span className="font-normal text-subtle"> {t('settings.people.you')}</span>}
              </p>
              <p className="truncate text-label text-muted">
                {accessSummary(u, rooms)}
              </p>
            </div>
            {u.reset_requested && <Badge tone="warn">{t('settings.people.resetRequested')}</Badge>}
            {u.kid && <Badge>{t('settings.people.kid')}</Badge>}
            <Badge tone={u.role === 'admin' ? 'info' : 'neutral'}>{u.role}</Badge>
            <Button variant="ghost" size="sm" aria-label={t('settings.people.edit', { name: u.username })} icon={<PencilSimple size={16} />} onClick={() => setEditing(u)} />
            {u.id !== me?.id && <Button variant="ghost" size="sm" aria-label={t('settings.people.remove', { name: u.username })} icon={<Trash size={16} />} onClick={() => setDeleting(u)} />}
          </li>
        ))}
      </ul>
      <UserSheet user={editing} onClose={() => setEditing(null)} />
      <Confirm open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending} title={t('settings.people.removeTitle', { name: deleting?.username ?? '' })} message={t('settings.people.removeMessage')} confirmLabel={t('drawer.removeConfirm')} />
    </Card>
  )
}

function accessSummary(u: User, rooms: Room[]) {
  if (u.role === 'admin' || u.all_rooms) return t('access.wholeHome')
  const parts = u.room_ids.flatMap((id) => {
    const name = rooms.find((r) => r.id === id)?.name
    return name ? [u.view_only_room_ids.includes(id) ? t('access.seeOnlySuffix', { name }) : name] : []
  })
  if (u.device_ids.length) parts.push(t('common.deviceCount', { count: u.device_ids.length }))
  return parts.join(', ') || t('access.noAccess')
}

type Level = 'none' | 'view' | 'control' | 'edit'
/** Granted ids and their level; an id that is missing has no access. */
type Levels = Record<string, Exclude<Level, 'none'>>
const levelOptions: { value: Level; label: string }[] = [
  { value: 'none', label: t('access.none') },
  { value: 'view', label: t('access.view') },
  { value: 'control', label: t('access.control') },
  { value: 'edit', label: t('access.edit') },
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
          aria-label={t('access.to', { label })}
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
  const status = room && room !== 'none' ? t('access.wholeRoomLevel', { level: levelOptions.find((o) => o.value === room)?.label.toLowerCase() ?? '' }) : count ? t('access.devicesOf', { count, total: devices.length }) : t('access.noAccess')
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 hover:bg-raised [&::-webkit-details-marker]:hidden">
        <CaretRight size={14} className="shrink-0 text-subtle transition-transform duration-base group-open:rotate-90" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className={cn('shrink-0 text-label', count || (room && room !== 'none') ? 'text-fg' : 'text-muted')}>{status}</span>
      </summary>
      <div className="divide-y divide-border border-t border-border">
        {onRoom && <AccessRow label={t('access.wholeRoom')} hint={t('access.coversLater')} value={room ?? 'none'} onChange={onRoom} />}
        {devices.map((d) => (
          <AccessRow key={d.id} label={d.name} value={levelOf(d)} onChange={(v) => onDevice(d.id, v)} />
        ))}
        {devices.length === 0 && <p className="py-3 pl-9 pr-3 text-label text-muted">{t('access.noDevicesInRoom')}</p>}
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

/** What an administrator passes on to a person: their first password, or a one-time reset code. */
function handoverText(u: User) {
  if (u.reset_code) {
    const code = u.reset_code.replace(/(\d{4})(\d{4})/, '$1 $2')
    const until = u.reset_allowed_until ? t('handover.until', { time: formatTime(u.reset_allowed_until) }) : ''
    return t('handover.reset', { username: u.username, code, until })
  }
  return t('handover.signIn', { address: window.location.origin, username: u.username, password: u.generated_password ?? '', note: u.kid ? '' : t('handover.chooseOwn') }).trim()
}

/** Shows the secret once, to copy or share. It is not stored readable anywhere, so closing this loses it. */
function Handover({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = user ? handoverText(user) : ''
  const canShare = typeof navigator.share === 'function'
  const close = () => {
    setCopied(false)
    onClose()
  }
  return (
    <Sheet
      open={!!user}
      onClose={close}
      title={user?.reset_code ? t('handover.resetTitle', { name: user.username }) : t('handover.signInTitle', { name: user?.username ?? '' })}
      description={t('handover.once')}
      footer={
        <Button variant="primary" onClick={close}>
          {t('common.done')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <pre className="select-all whitespace-pre-wrap break-words rounded-lg border border-border bg-raised p-3 font-mono text-label text-fg">{text}</pre>
        <div className="flex gap-2">
          <Button
            data-autofocus
            icon={copied ? <Check size={16} /> : <Copy size={16} />}
            onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
          >
            {t(copied ? 'handover.copied' : 'handover.copy')}
          </Button>
          {canShare && (
            <Button icon={<ShareNetwork size={16} />} onClick={() => navigator.share({ text }).catch(() => {})}>
              {t('handover.share')}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  )
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
    kid: false,
    role: 'member' as Role,
    avatar: '',
    all_rooms: true,
    rooms: {} as Levels,
    devices: {} as Levels,
  })
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [handover, setHandover] = useState<User | null>(null)
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
      kid: existing?.kid ?? false,
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
          kid: form.kid,
          ...grants,
          ...(form.kid && form.password ? { password: form.password } : {}),
        })
        if (existing.id === me?.id) {
          updateUser(updated)
        }
      } else {
        const created = await api.createUser({ ...account, ...grants, password: form.kid ? form.password : undefined })
        if (created.generated_password) setHandover(created)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.users })
      toast.push({ tone: 'success', title: existing ? t('user.accessUpdated') : t('user.added', { name: form.username }) })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  // Not part of Save: a new password or reset code takes effect at once and is shown once.
  const issue = useMutation({
    mutationFn: (b: { reset_password: true } | { reset_allowed: boolean }) => api.updateUser(existing!.id, b),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: keys.users })
      if (u.generated_password || u.reset_code) setHandover(u)
      else toast.push({ tone: 'success', title: t('user.resetWithdrawn') })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const self = existing?.id === me?.id
  const passwordMissing = form.kid && form.password.length < 8 && (!existing || !existing.kid || form.password.length > 0)
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
        title={existing ? t('user.editTitle', { name: existing.username }) : t('settings.people.add')}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={emailStatus === 'taken' || (!existing && !form.username) || passwordMissing} onClick={() => save.mutate()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Avatar row */}
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-raised/30 p-3">
            <Avatar avatar={form.avatar} username={form.username || t('user.fallbackName')} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-label font-medium text-fg">{t('user.avatar')}</p>
              <p className="truncate text-caption text-muted">{t('user.avatarSub')}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" icon={<DiceFive size={16} />} onClick={handleRollAvatar}>
                {t('settings.roll')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarModalOpen(true)}>
                {t('user.pick')}
              </Button>
            </div>
          </div>

          {!existing && <Field label={t('settings.username')} required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />}
          <div className="flex items-start gap-2">
            <Field
              label={t('settings.email')}
              type="email"
              className="min-w-0 flex-1"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={emailStatus === 'taken' ? t('settings.email.taken') : undefined}
              hint={emailStatus === 'free' ? t('settings.email.free') : emailStatus === 'checking' ? t('settings.email.checking') : t('settings.email.hint')}
            />
            <Button type="button" className="mt-[26px]" loading={generate.isPending} disabled={name.length < 3} onClick={() => generate.mutate()}>
              {t('user.generate')}
            </Button>
          </div>
          {!self && (
            <section className="flex flex-col gap-2" aria-label={t('settings.password.title')}>
              <p className="text-label font-medium text-fg">{t('settings.password.title')}</p>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{t('settings.password.kidAccount')}</p>
                  <p className="mt-0.5 text-label text-muted">{t(form.kid ? 'user.kidOn' : 'user.kidOff')}</p>
                </div>
                <Switch checked={form.kid} onChange={(v) => setForm({ ...form, kid: v })} label={t('settings.password.kidAccount')} />
              </div>
              {form.kid ? (
                <Field label={t(existing?.kid ? 'settings.password.new' : 'settings.password.title')} type="password" autoComplete="new-password" required={!existing?.kid} hint={existing?.kid ? t('user.keepPassword') : t('auth.atLeast8')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              ) : existing ? (
                <>
                  {existing.reset_requested && <Notice tone="warn">{t('user.forgotAsked', { name: existing.username })}</Notice>}
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{t('user.resetCode')}</p>
                      <p className="mt-0.5 text-label text-muted">
                        {existing.reset_allowed && existing.reset_allowed_until
                          ? t('user.codeActive', { time: formatTime(existing.reset_allowed_until) })
                          : t('user.codeHelp')}
                      </p>
                    </div>
                    <Switch checked={existing.reset_allowed} disabled={issue.isPending} onChange={(v) => issue.mutate({ reset_allowed: v })} label={t('user.resetCode')} />
                  </div>
                  <Button type="button" className="self-start" loading={issue.isPending} onClick={() => issue.mutate({ reset_password: true })}>
                    {t('user.generatePassword')}
                  </Button>
                </>
              ) : (
                <p className="text-caption text-subtle">{t('user.passwordAfterSave')}</p>
              )}
            </section>
          )}
          <SelectField label={t('settings.roleLabel')} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} hint={roleHelp[form.role]}>
            <option value="admin">{t('role.admin')}</option>
            <option value="member">{t('role.member')}</option>
            <option value="guest">{t('role.guest')}</option>
          </SelectField>
          {form.role !== 'admin' && (
            <section className="flex flex-col gap-2" aria-label={t('user.access')}>
              <p className="text-label font-medium text-fg">{t('user.access')}</p>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{t('user.customAccess')}</p>
                  <p className="mt-0.5 text-label text-muted">{t(form.all_rooms ? 'user.customOff' : 'user.customOn')}</p>
                </div>
                <Switch checked={!form.all_rooms} onChange={(v) => setForm({ ...form, all_rooms: !v })} label={t('user.customAccess')} />
              </div>
              {!form.all_rooms && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="sr-only">{t('user.roomsAndDevices')}</legend>
                  {rooms.length === 0 && devices.length === 0 && <p className="rounded-lg border border-border p-3 text-label text-muted">{t('user.createRoomsFirst')}</p>}
                  {rooms.map((r) => (
                    <RoomAccess key={r.id} name={r.name} devices={inRoom(r.id)} room={form.rooms[r.id]} levelOf={levelOf} onRoom={(v) => setRoom(r.id, v)} onDevice={(id, v) => setDevice(r.id, id, v)} />
                  ))}
                  {inRoom(null).length > 0 && <RoomAccess name={t('devices.noRoom')} devices={inRoom(null)} levelOf={levelOf} onDevice={(id, v) => setDevice(null, id, v)} />}
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
        username={form.username || t('user.fallbackUsername')}
        onSave={(newAvatar) => setForm((f) => ({ ...f, avatar: newAvatar }))}
      />
      <Handover user={handover} onClose={() => setHandover(null)} />
    </>
  )
}
