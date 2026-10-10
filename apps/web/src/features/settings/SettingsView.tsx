import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Badge, Card, CardHeader, ErrorText, PageHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Segmented, Switch } from '@/components/ui/Controls'
import { Checkbox, Field, SelectField } from '@/components/ui/Field'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { api, desktop } from '@/lib/api'
import { useAuth, useIsAdmin } from '@/lib/auth'
import { keys, useRooms, useServerLinks } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { useTheme } from '@/lib/theme'
import type { Role, User } from '@/lib/types'

const roleHelp: Record<Role, string> = {
  admin: 'Full access, including devices, integrations, people and settings.',
  member: 'Can view and control devices in their rooms.',
  guest: 'Can view devices in their rooms.',
}

export function SettingsView() {
  const { user } = useAuth()
  const admin = useIsAdmin()
  const [theme, setTheme] = useTheme()
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
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
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-raised text-caption font-semibold uppercase">{u.username.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium">
                {u.username}
                {u.id === me?.id && <span className="font-normal text-subtle"> (you)</span>}
              </p>
              <p className="truncate text-label text-muted">
                {u.role === 'admin' || u.all_rooms ? 'All rooms' : u.room_ids.map((id) => rooms.find((r) => r.id === id)?.name).filter(Boolean).join(', ') || 'No rooms'}
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

function UserSheet({ user, onClose }: { user: User | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: rooms = [] } = useRooms()
  const existing = user && user !== 'new' ? user : null
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'member' as Role, all_rooms: true, room_ids: [] as string[] })
  const [key, setKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = existing?.id ?? (user === 'new' ? 'new' : null)
  if (current !== key) {
    setKey(current)
    setError(null)
    setForm({ username: existing?.username ?? '', email: existing?.email ?? '', password: '', role: existing?.role ?? 'member', all_rooms: existing?.all_rooms ?? true, room_ids: existing?.room_ids ?? [] })
  }
  const save = useMutation({
    mutationFn: async () => {
      if (existing) {
        await api.updateUser(existing.id, { email: form.email, role: form.role, all_rooms: form.all_rooms, room_ids: form.room_ids, ...(form.password ? { password: form.password } : {}) })
      } else {
        await api.createUser(form)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.users })
      toast.push({ tone: 'success', title: existing ? 'Access updated' : `${form.username} added` })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const toggleRoom = (id: string) => setForm((f) => ({ ...f, room_ids: f.room_ids.includes(id) ? f.room_ids.filter((x) => x !== id) : [...f.room_ids, id] }))
  return (
    <Sheet
      open={!!user}
      onClose={onClose}
      title={existing ? `Edit ${existing.username}` : 'Add person'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!existing && (!form.username || form.password.length < 8)} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!existing && <Field label="Username" required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />}
        <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label={existing ? 'New password' : 'Password'} type="password" autoComplete="new-password" required={!existing} hint={existing ? 'Leave empty to keep the current password.' : 'At least 8 characters.'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <SelectField label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} hint={roleHelp[form.role]}>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="guest">Guest</option>
        </SelectField>
        {form.role !== 'admin' && (
          <div className="rounded-lg border border-border">
            <div className="flex min-h-12 items-center justify-between gap-3 px-3">
              <div>
                <p>All rooms</p>
                <p className="text-label text-muted">Turn off to choose specific rooms.</p>
              </div>
              <Switch checked={form.all_rooms} onChange={(v) => setForm({ ...form, all_rooms: v })} label="Access to all rooms" />
            </div>
            {!form.all_rooms && (
              <fieldset className="border-t border-border p-1">
                <legend className="sr-only">Rooms</legend>
                {rooms.length === 0 && <p className="p-2 text-label text-muted">Create rooms first.</p>}
                {rooms.map((r) => (
                  <Checkbox key={r.id} checked={form.room_ids.includes(r.id)} onChange={() => toggleRoom(r.id)}>
                    {r.name}
                  </Checkbox>
                ))}
              </fieldset>
            )}
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  )
}
