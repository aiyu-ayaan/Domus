import { WifiSlash } from '@phosphor-icons/react'
import { Switch } from '@/components/ui/Controls'
import { canToggle, deviceIcons, deviceSummary } from '@/lib/devices'
import { cn } from '@/lib/cn'
import { formatWatts } from '@/lib/format'
import { useCommand } from '@/lib/queries'
import { useCanControl } from '@/lib/auth'
import type { Device, Room } from '@/lib/types'

/** One device as a list row: icon · name/status · power · switch. */
export function DeviceRow({ device, room, onOpen }: { device: Device; room?: Room; onOpen: () => void }) {
  const command = useCommand()
  const control = useCanControl()
  const Icon = deviceIcons[device.device_type]
  const on = device.is_online && device.state.is_on === true
  const watts = device.is_online ? device.state.current_power_watts : undefined

  return (
    <li className="group relative flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-fast hover:bg-raised/60">
      <button onClick={onOpen} className="absolute inset-0 cursor-pointer focus-visible:outline-offset-[-2px]" aria-label={`Open ${device.name}`} />
      <Icon size={18} className={cn('pointer-events-none relative shrink-0', on ? 'text-on' : 'text-subtle')} aria-hidden />
      <div className="pointer-events-none relative min-w-0 flex-1">
        <p className="truncate text-body font-medium">{device.name}</p>
        <p className="flex items-center gap-1.5 truncate text-label text-muted">
          {!device.is_online && <WifiSlash size={13} className="shrink-0 text-danger" aria-hidden />}
          {room ? `${room.name} · ` : ''}
          {deviceSummary(device)}
        </p>
      </div>
      {watts != null && watts > 0 && (
        <span className="pointer-events-none relative hidden text-label text-muted tabular sm:block">{formatWatts(watts)}</span>
      )}
      {canToggle(device) && (
        <span className="relative">
          <Switch
            checked={on}
            disabled={!control || !device.is_online}
            label={`${device.name} power`}
            onChange={(v) => command.mutate({ id: device.id, cmd: { is_on: v } })}
          />
        </span>
      )}
    </li>
  )
}
