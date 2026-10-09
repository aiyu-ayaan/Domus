import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Door, PencilSimple, Plus, Power, Trash } from '@phosphor-icons/react'
import { EmptyState, PageHeader, Skeleton } from '@/components/Layout'
import { Button } from '@/components/Button'
import { Sheet, Confirm } from '@/components/Sheet'
import { Field } from '@/components/Field'
import { DeviceTile } from '@/components/DeviceTile'
import { DeviceSheet } from '@/components/DeviceSheet'
import { api } from '@/lib/api'
import { useCanControl, useIsAdmin } from '@/lib/auth'
import { keys, useDevices, useRooms } from '@/lib/queries'
import { roomIcon, roomIconChoices } from '@/lib/devices'
import { errorMessage, useToast } from '@/lib/toast'
import { formatWatts } from '@/lib/format'
import { cn } from '@/lib/cn'
import { rise, spring, stagger } from '@/lib/motion'
import type { Room } from '@/lib/types'

export function RoomsView() {
  const admin = useIsAdmin()
  const { data: rooms, isLoading } = useRooms()
  const { data: devices = [] } = useDevices()
  const [editing, setEditing] = useState<Room | 'new' | null>(null)

  return (
    <div>
      <PageHeader
        title="Rooms"
        subtitle="Organise devices by where they are"
        actions={
          admin && (
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => setEditing('new')}>
              New room
            </Button>
          )
        }
      />
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !rooms?.length ? (
        <EmptyState
          icon={<Door size={30} />}
          title="No rooms yet"
          message="Create rooms like Bedroom or Kitchen, then assign devices to them."
          action={admin && <Button variant="primary" onClick={() => setEditing('new')}>Create a room</Button>}
        />
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {rooms.map((r) => {
            const Icon = roomIcon(r.name, r.icon)
            const inRoom = devices.filter((d) => d.room_id === r.id)
            const on = inRoom.filter((d) => d.state.is_on && d.is_online).length
            const watts = inRoom.reduce((s, d) => s + (d.is_online ? d.state.current_power_watts ?? 0 : 0), 0)
            return (
              <motion.div key={r.id} variants={rise} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={spring.fast}>
                <Link to={`/rooms/${r.id}`} className="surface flex h-full min-h-40 flex-col rounded-4xl p-5">
                  <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', on ? 'bg-accent text-on-accent' : 'bg-line/[0.08] text-muted')}>
                    <Icon size={26} weight={on ? 'fill' : 'regular'} aria-hidden />
                  </span>
                  <p className="mt-auto pt-4 text-lg font-bold">{r.name}</p>
                  <p className="text-sm text-muted tabular">
                    {inRoom.length} {inRoom.length === 1 ? 'device' : 'devices'}
                    {on > 0 && ` · ${on} on`}
                    {watts > 0 && ` · ${formatWatts(watts)}`}
                  </p>
                </Link>
              </motion.div>
            )
          })}
        </motion.div>
      )}
      <RoomSheet room={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

export function RoomDetailView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const admin = useIsAdmin()
  const control = useCanControl()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: rooms = [] } = useRooms()
  const { data: devices = [] } = useDevices()
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const room = rooms.find((r) => r.id === id)
  const inRoom = devices.filter((d) => d.room_id === id)

  const allOff = useMutation({
    mutationFn: async (on: boolean) => {
      const targets = inRoom.filter((d) => d.is_online && d.state.is_on !== undefined && d.device_type !== 'sensor')
      const results = await Promise.allSettled(targets.map((d) => api.command(d.id, { is_on: on })))
      return results.filter((r) => r.status === 'rejected').length
    },
    onSuccess: (failed) => {
      qc.invalidateQueries({ queryKey: keys.devices })
      if (failed) toast.push({ tone: 'warning', title: `${failed} device(s) did not respond` })
    },
  })
  const remove = useMutation({
    mutationFn: () => api.removeRoom(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.rooms })
      qc.invalidateQueries({ queryKey: keys.devices })
      navigate('/rooms')
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not delete room', message: errorMessage(e) }),
  })

  if (!room) {
    return <EmptyState icon={<Door size={30} />} title="Room not found" message="It may have been deleted." action={<Link to="/rooms" className="font-semibold text-accent">Back to rooms</Link>} />
  }
  const Icon = roomIcon(room.name, room.icon)

  return (
    <div>
      <Link to="/rooms" className="mb-4 inline-flex h-11 items-center gap-2 rounded-2xl pr-3 font-semibold text-muted hover:text-fg">
        <ArrowLeft size={18} aria-hidden /> Rooms
      </Link>
      <PageHeader
        title={room.name}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <Icon size={18} aria-hidden /> {inRoom.length} devices
          </span>
        }
        actions={
          <>
            {control && inRoom.length > 0 && (
              <>
                <Button variant="glass" icon={<Power size={18} />} onClick={() => allOff.mutate(true)} loading={allOff.isPending && allOff.variables}>
                  All on
                </Button>
                <Button variant="glass" onClick={() => allOff.mutate(false)} loading={allOff.isPending && !allOff.variables}>
                  All off
                </Button>
              </>
            )}
            {admin && (
              <>
                <Button variant="ghost" aria-label="Edit room" icon={<PencilSimple size={20} />} onClick={() => setEditing(true)} />
                <Button variant="ghost" aria-label="Delete room" icon={<Trash size={20} />} onClick={() => setDeleting(true)} />
              </>
            )}
          </>
        }
      />
      {inRoom.length === 0 ? (
        <EmptyState icon={<Door size={30} />} title="Empty room" message="Open a device and choose this room in its settings." />
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {inRoom.map((d) => (
            <DeviceTile key={d.id} device={d} onOpen={() => setOpen(d.id)} />
          ))}
        </motion.div>
      )}
      <DeviceSheet device={devices.find((d) => d.id === open) ?? null} onClose={() => setOpen(null)} />
      <RoomSheet room={editing ? room : null} onClose={() => setEditing(false)} />
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${room.name}?`}
        message="Devices in this room are kept and become unassigned."
      />
    </div>
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
      toast.push({ tone: 'success', title: existing ? 'Room updated' : `${name} created` })
      onClose()
    },
    onError: (e) => toast.push({ tone: 'error', title: 'Could not save room', message: errorMessage(e) }),
  })
  return (
    <Sheet
      open={!!room}
      onClose={onClose}
      title={existing ? 'Edit room' : 'New room'}
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
      <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), name.trim() && save.mutate())}>
        <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Living room" />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-muted">Icon</legend>
          <div className="grid grid-cols-5 gap-2">
            {roomIconChoices.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setIcon(c.id)}
                aria-pressed={icon === c.id}
                aria-label={c.label}
                className={cn(
                  'flex h-14 cursor-pointer items-center justify-center rounded-2xl transition-colors',
                  icon === c.id ? 'bg-accent text-on-accent' : 'bg-line/[0.06] text-muted hover:text-fg',
                )}
              >
                <c.icon size={24} weight={icon === c.id ? 'fill' : 'regular'} />
              </button>
            ))}
          </div>
        </fieldset>
      </form>
    </Sheet>
  )
}

