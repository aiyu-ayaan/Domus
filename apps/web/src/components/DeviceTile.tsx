import { motion } from 'motion/react'
import { Power, WifiSlash } from '@phosphor-icons/react'
import { canToggle, deviceIcons, deviceSummary, deviceTone } from '@/lib/devices'
import { cn } from '@/lib/cn'
import { rise, spring } from '@/lib/motion'
import { useCommand } from '@/lib/queries'
import { useCanControl } from '@/lib/auth'
import type { Device, Room } from '@/lib/types'

const toneBg = {
  light: 'bg-light/[0.14] border-light/30',
  air: 'bg-air/[0.12] border-air/30',
  power: 'bg-power/[0.12] border-power/30',
  accent: 'bg-accent/[0.12] border-accent/30',
}
const toneIcon = {
  light: 'bg-light text-black/80',
  air: 'bg-air text-black/80',
  power: 'bg-power text-black/80',
  accent: 'bg-accent text-on-accent',
}

export function DeviceTile({ device, room, onOpen }: { device: Device; room?: Room; onOpen: () => void }) {
  const command = useCommand()
  const control = useCanControl()
  const Icon = deviceIcons[device.device_type]
  const tone = deviceTone(device.device_type)
  const on = device.is_online && device.state.is_on === true
  const toggleable = canToggle(device) && device.is_online

  return (
    <motion.div
      variants={rise}
      layout
      transition={spring.default}
      className={cn(
        'surface group relative flex min-h-[148px] flex-col rounded-4xl p-4 transition-[background,border-color] duration-300 ease-standard',
        on && toneBg[tone],
        !device.is_online && 'opacity-70',
      )}
    >
      <button
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer rounded-4xl"
        aria-label={`${device.name} details`}
      />
      <div className="pointer-events-none relative flex items-start justify-between">
        <motion.span
          animate={{ scale: on ? 1 : 0.94 }}
          transition={spring.bouncy}
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-300',
            on ? toneIcon[tone] : 'bg-line/[0.08] text-muted',
          )}
        >
          <Icon size={24} weight={on ? 'fill' : 'regular'} aria-hidden />
        </motion.span>
        {!device.is_online ? (
          <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2 py-1 text-xs font-semibold text-danger">
            <WifiSlash size={14} aria-hidden /> Offline
          </span>
        ) : (
          toggleable &&
          control && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              transition={spring.fast}
              onClick={() => command.mutate({ id: device.id, cmd: { is_on: !device.state.is_on } })}
              aria-label={`Turn ${device.name} ${on ? 'off' : 'on'}`}
              aria-pressed={on}
              className={cn(
                'pointer-events-auto relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-300',
                on ? 'bg-white/90 text-black' : 'bg-line/[0.08] text-muted hover:text-fg',
              )}
            >
              <Power size={20} weight="bold" />
            </motion.button>
          )
        )}
      </div>
      <div className="pointer-events-none relative mt-auto pt-4">
        <p className="truncate font-semibold" title={device.name}>
          {device.name}
        </p>
        <p className="mt-0.5 truncate text-sm text-muted tabular">
          {room ? `${room.name} · ` : ''}
          {deviceSummary(device)}
        </p>
      </div>
    </motion.div>
  )
}
