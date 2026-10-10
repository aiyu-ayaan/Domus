import { useEffect, useState } from 'react'
import { Slider } from '@/components/ui/Controls'
import { useCommand } from '@/lib/queries'
import { cn } from '@/lib/cn'
import type { Device } from '@/lib/types'

/**
 * Stepless fan speed (a purifier's manual level), unfolding under the mode picker while the mode is Manual.
 * Renders nothing for devices without one.
 */
export function FanSpeedSlider({ device, disabled, className }: { device: Device; disabled?: boolean; className?: string }) {
  const command = useCommand()
  const speed = device.state.fan_percent
  const [value, setValue] = useState(speed ?? 0)
  useEffect(() => setValue(speed ?? 0), [speed])
  if (speed == null) return null
  // The level only drives the fan in manual mode.
  const open = device.state.mode === 'Manual'
  // Rated room size is 0.07-0.12 m² per m³/h of CADR; airflow is taken as linear in speed.
  const [low, high] = device.state.fan_cadr ?? [0, 0]
  const cadr = low + ((high - low) * value) / 100
  return (
    <div
      aria-hidden={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      {/* The side padding keeps the thumb's focus ring from being clipped. */}
      <div className="-mx-1 min-h-0 overflow-hidden px-1">
        <div className={className}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body">Speed</span>
            {cadr > 0 && (
              <span className="text-label text-muted tabular">
                Coverage {Math.floor(cadr * 0.07)}–{Math.floor(cadr * 0.12)} m²
              </span>
            )}
          </div>
          <Slider
            label={`${device.name} speed`}
            value={value}
            onChange={setValue}
            onCommit={(v) => command.mutate({ id: device.id, cmd: { fan_percent: v } })}
            disabled={disabled || !open}
          />
        </div>
      </div>
    </div>
  )
}
