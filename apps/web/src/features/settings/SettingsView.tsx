import { useState } from 'react'
import { motion } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSimple, Plus, Trash, UserCircle } from '@phosphor-icons/react'
import { Badge, Card, PageHeader, SectionTitle } from '@/components/Layout'
import { Button } from '@/components/Button'
import { Segmented, Switch } from '@/components/Controls'
import { Field, SelectField } from '@/components/Field'
import { Sheet, Confirm } from '@/components/Sheet'
import { api } from '@/lib/api'
import { useAuth, useIsAdmin } from '@/lib/auth'
import { keys, useRooms } from '@/lib/queries'
import { errorMessage, useToast } from '@/lib/toast'
import { stagger } from '@/lib/motion'
import type { Role, User } from '@/lib/types'
import { useTheme } from '@/lib/theme'

const roleTone: Record<Role, 'accent' | 'info' | 'muted'> = { admin: 'accent', member: 'info', guest: 'muted' }
const roleHelp: Record<Role, string> = {
  admin: 'Full access: devices, plugins, users and settings',
  member: 'Can control devices in their rooms',
  guest: 'Can view devices in their rooms',
}

export function SettingsView() {
  const { user } = useAuth()
  const admin = useIsAdmin()
  const [theme, setTheme] = useTheme()

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-4">
            <UserCircle size={56} weight="duotone" className="text-accent" aria-hidden />
            <div>
              <p className="text-lg font-bold">{user?.username}</p>
              <p className="text-sm text-muted">{user?.email}</p>
              <div className="mt-1">{user && <Badge tone={roleTone[user.role]}>{user.role}</Badge>}</div>
            </div>
          </div>
          <PasswordForm />
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Appearance</h2>
          <p className="mt-1 text-sm text-muted">Follows your device by default.</p>
          <Segmented
            label="Theme"
            className="mt-4"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
          <p className="mt-4 text-sm text-muted">
            Reduced motion and reduced transparency from your system settings are respected automatically.
          </p>
        </Card>
      </div>
      {admin && <UsersSection />}
    </motion.div>
  )
}

function PasswordForm() {
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
    <form
      className="mt-6 flex flex-col gap-3 border-t border-line/10 pt-5"
      onSubmit={(e) => {
        e.preventDefault()
        change.mutate()
      }}
    >
      <h3 className="font-bold">Change password</h3>
      <Field label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Field label="New password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} />
      <Button type="submit" variant="glass" loading={change.isPending} disabled={!current || next.length < 8} className="self-start">
        Update password
      </Button>
    </form>
  )
}

function UsersSection() {
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
    onError: (e) => toast.push({ tone: 'error', title: 'Could not remove user', message: errorMessage(e) }),
  })
  return (
    <>
      <SectionTitle
        action={
          <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Add person
          </Button>
        }
      >
        People & access
      </SectionTitle>
      <Card className="p-2 sm:p-3">
        <ul className="flex flex-col">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-3xl p-3 hover:bg-line/[0.03]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-line/[0.08] font-bold uppercase">{u.username.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {u.username} {u.id === me?.id && <span className="text-sm font-normal text-muted">(you)</span>}
                </p>
                <p className="truncate text-sm text-muted">
                  {u.role === 'admin' || u.all_rooms
                    ? 'All rooms'
                    : u.room_ids.map((id) => rooms.find((r) => r.id === id)?.name).filter(Boolean).join(', ') || 'No rooms'}
                </p>
              </div>
              <Badge tone={roleTone[u.role]}>{u.role}</Badge>
              <Button variant="ghost" size="sm" aria-label={`Edit ${u.username}`} icon={<PencilSimple size={18} />} onClick={() => setEditing(u)} />
              {u.id !== me?.id && <Button variant="ghost" size="sm" aria-label={`Remove ${u.username}`} icon={<Trash size={18} />} onClick={() => setDeleting(u)} />}
            </li>
          ))}
        </ul>
      </Card>
      <UserSheet user={editing} onClose={() => setEditing(null)} />
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Remove ${deleting?.username}?`}
        message="They will be signed out and lose access immediately."
        confirmLabel="Remove"
      />
    </>
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
    setForm({
      username: existing?.username ?? '',
      email: existing?.email ?? '',
      password: '',
      role: existing?.role ?? 'member',
      all_rooms: existing?.all_rooms ?? true,
      room_ids: existing?.room_ids ?? [],
    })
  }
  const save = useMutation({
    mutationFn: () =>
      existing
        ? api.updateUser(existing.id, {
            email: form.email,
            role: form.role,
            all_rooms: form.all_rooms,
            room_ids: form.room_ids,
            ...(form.password ? { password: form.password } : {}),
          })
        : api.createUser(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.users })
      toast.push({ tone: 'success', title: existing ? 'Access updated' : `${form.username} added` })
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const toggleRoom = (id: string) =>
    setForm((f) => ({ ...f, room_ids: f.room_ids.includes(id) ? f.room_ids.filter((x) => x !== id) : [...f.room_ids, id] }))

  return (
    <Sheet
      open={!!user}
      onClose={onClose}
      title={existing ? `Edit ${existing.username}` : 'Add person'}
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto self-center text-sm text-danger">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()} disabled={!existing && (!form.username || form.password.length < 8)}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!existing && <Field label="Username" required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />}
        <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field
          label={existing ? 'New password (optional)' : 'Password'}
          type="password"
          autoComplete="new-password"
          required={!existing}
          hint="At least 8 characters."
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <SelectField label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} hint={roleHelp[form.role]}>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="guest">Guest</option>
        </SelectField>
        {form.role !== 'admin' && (
          <div className="flex flex-col gap-3 rounded-3xl bg-line/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Access to all rooms</p>
                <p className="text-sm text-muted">Turn off to choose specific rooms</p>
              </div>
              <Switch checked={form.all_rooms} onChange={(v) => setForm({ ...form, all_rooms: v })} label="Access to all rooms" />
            </div>
            {!form.all_rooms && (
              <fieldset className="flex flex-col gap-1">
                <legend className="sr-only">Rooms</legend>
                {rooms.length === 0 && <p className="text-sm text-muted">Create rooms first.</p>}
                {rooms.map((r) => (
                  <label key={r.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl px-2 hover:bg-line/[0.05]">
                    <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={form.room_ids.includes(r.id)} onChange={() => toggleRoom(r.id)} />
                    {r.name}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
