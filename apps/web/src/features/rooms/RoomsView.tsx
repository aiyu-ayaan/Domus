import { t } from '@/lib/i18n'
import { useState } from 'react'
import { useConfirmSwitch } from '@/components/devices/ConfirmSwitch'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CaretRight, Door, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sheet, Confirm } from '@/components/ui/Sheet'
import { Field } from '@/components/ui/Field'
import { DeviceRow } from '@/components/devices/DeviceRow'
import { DeviceDrawer } from '@/components/devices/DeviceDrawer'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useRooms } from '@/lib/queries'
import { roomIcon, roomIconChoices } from '@/lib/devices'
import { errorMessage, useToast } from '@/lib/toast'
import { formatWatts } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Room } from '@/lib/types'

export function RoomsView() {
  const admin = useIsAdmin()
  const { data: rooms, isLoading } = useRooms()
  const { data: devices = [] } = useDevices()
  const [editing, setEditing] = useState<Room | 'new' | null>(null)
  return (
    <>
      <PageHeader
        title={t('rooms.title')}
        description={t('rooms.description')}
        actions={admin && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('rooms.new')}</Button>}
      />
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !rooms?.length ? (
        <EmptyState icon={<Door size={28} />} title={t('rooms.empty.title')} message={t('rooms.empty.message')} action={admin && <Button variant="primary" onClick={() => setEditing('new')}>{t('rooms.create')}</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => {
            const Icon = roomIcon(r.name, r.icon)
            const inRoom = devices.filter((d) => d.room_id === r.id)
            const on = inRoom.filter((d) => d.is_online && d.state.is_on).length
            const offline = inRoom.filter((d) => !d.is_online).length
            const watts = inRoom.reduce((s, d) => s + (d.is_online ? d.state.current_power_watts ?? 0 : 0), 0)
            return (
              <Link key={r.id} to={`/rooms/${r.id}`} className="group flex items-center gap-3 rounded-lg border border-border bg-panel p-4 transition-colors duration-fast hover:border-border-strong">
                <Icon size={20} className={on ? 'text-on' : 'text-subtle'} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{r.name}</p>
                  <p className="truncate text-label text-muted tabular">
                    {t('rooms.summary', { devices: t('common.deviceCount', { count: inRoom.length }), on })}
                    {watts > 0 && ` · ${formatWatts(watts)}`}
                    {offline > 0 && <span className="text-danger"> · {t('rooms.offline', { count: offline })}</span>}
                  </p>
                </div>
                <CaretRight size={16} className="text-subtle transition-transform duration-fast rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden />
              </Link>
            )
          })}
        </div>
      )}
      <RoomSheet room={editing} onClose={() => setEditing(null)} />
    </>
  )
}

export function RoomDetailView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const admin = useIsAdmin()
  const control = useCanControl()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: rooms = [], isLoading } = useRooms()
  const { data: devices = [] } = useDevices()
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const room = rooms.find((r) => r.id === id)
  const inRoom = devices.filter((d) => d.room_id === id)

  const guard = useConfirmSwitch()
  const setAll = useMutation({
    mutationFn: async (on: boolean) => {
      const targets = inRoom.filter((d) => d.is_online && d.state.is_on !== undefined && d.device_type !== 'sensor')
      const res = await Promise.allSettled(targets.map((d) => api.command(d.id, { is_on: on })))
      return res.filter((r) => r.status === 'rejected').length
    },
    onSuccess: (failed) => {
      qc.invalidateQueries({ queryKey: keys.devices })
      if (failed) toast.push({ tone: 'warning', title: t('rooms.noResponse', { count: failed }) })
    },
  })
  const remove = useMutation({
    mutationFn: () => api.removeRoom(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.rooms })
      qc.invalidateQueries({ queryKey: keys.devices })
      navigate('/rooms')
    },
    onError: (e) => toast.push({ tone: 'error', title: t('rooms.deleteFailed'), message: errorMessage(e) }),
  })

  if (isLoading) return <Skeleton className="h-40" />
  if (!room) return <EmptyState icon={<Door size={28} />} title={t('rooms.notFound.title')} message={t('rooms.notFound.message')} action={<Button onClick={() => navigate('/rooms')}>{t('rooms.backToRooms')}</Button>} />

  return (
    <>
      <Link to="/rooms" className="mb-3 inline-flex h-8 items-center gap-1.5 text-label text-muted hover:text-fg">
        <ArrowLeft size={14} className="rtl:-scale-x-100" aria-hidden /> {t('rooms.title')}
      </Link>
      <PageHeader
        title={room.name}
        description={t('common.deviceCount', { count: inRoom.length })}
        actions={
          <>
            {control && inRoom.length > 0 && (
              <>
                <Button size="sm" onClick={() => guard.ask(inRoom, true, () => setAll.mutate(true))} loading={setAll.isPending && setAll.variables}>{t('rooms.allOn')}</Button>
                <Button size="sm" onClick={() => guard.ask(inRoom, false, () => setAll.mutate(false))} loading={setAll.isPending && !setAll.variables}>{t('rooms.allOff')}</Button>
              </>
            )}
            {admin && (
              <>
                <Button variant="ghost" size="sm" aria-label={t('rooms.edit')} icon={<PencilSimple size={16} />} onClick={() => setEditing(true)} />
                <Button variant="ghost" size="sm" aria-label={t('rooms.delete')} icon={<Trash size={16} />} onClick={() => setDeleting(true)} />
              </>
            )}
          </>
        }
      />
      {inRoom.length === 0 ? (
        <EmptyState icon={<Door size={28} />} title={t('rooms.noDevices.title')} message={t('rooms.noDevices.message')} />
      ) : (
        <Card>
          <CardHeader title={t('common.devices')} />
          <ul className="divide-y divide-border">
            {inRoom.map((d) => (
              <DeviceRow key={d.id} device={d} onOpen={() => setOpen(d.id)} />
            ))}
          </ul>
        </Card>
      )}
      <DeviceDrawer device={devices.find((d) => d.id === open) ?? null} onClose={() => setOpen(null)} />
      <RoomSheet room={editing ? room : null} onClose={() => setEditing(false)} />
      {guard.dialog}
      <Confirm open={deleting} onClose={() => setDeleting(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} title={t('rooms.deleteTitle', { name: room.name })} message={t('rooms.deleteMessage')} />
    </>
  )
}

function RoomSheet({ room, onClose }: { room: Room | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = room && room !== 'new' ? room : null
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('house')
  const [key, setKey] = useState<string | null>(null)
  const current = existing?.id ?? (room === 'new' ? 'new' : null)
  if (current !== key) {
    setKey(current)
    setName(existing?.name ?? '')
    setIcon(existing?.icon ?? 'house')
  }
  const save = useMutation({
    mutationFn: async () => {
      if (existing) await api.updateRoom(existing.id, { name, icon })
      else await api.createRoom({ name, icon })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.rooms })
      toast.push({ tone: 'success', title: existing ? t('rooms.updated') : t('rooms.created', { name }) })
      onClose()
    },
    onError: (e) => toast.push({ tone: 'error', title: t('rooms.saveFailed'), message: errorMessage(e) }),
  })
  return (
    <Sheet
      open={!!room}
      onClose={onClose}
      title={existing ? t('rooms.edit') : t('rooms.new')}
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
      <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), name.trim() && save.mutate())}>
        <Field label={t('common.name')} required placeholder={t('rooms.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <fieldset>
          <legend className="mb-2 text-label font-medium">{t('common.icon')}</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {roomIconChoices.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setIcon(c.id)}
                aria-pressed={icon === c.id}
                aria-label={c.label}
                title={c.label}
                className={cn('flex h-10 cursor-pointer items-center justify-center rounded-md border transition-colors duration-fast', icon === c.id ? 'border-fg text-fg' : 'border-border text-subtle hover:text-fg')}
              >
                <c.icon size={18} />
              </button>
            ))}
          </div>
        </fieldset>
      </form>
    </Sheet>
  )
}
