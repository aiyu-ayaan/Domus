import { useEffect, useState } from 'react'
import { Slider } from '@/components/ui/Controls'
import { useCommand } from '@/lib/queries'
import type { Device } from '@/lib/types'

/** Stepless fan speed (a purifier's manual level); renders nothing for devices without one. */
export function FanSpeedSlider({ device, disabled, className }: { device: Device; disabled?: boolean; className?: string }) {
  const command = useCommand()
  const speed = device.state.fan_percent
  const [value, setValue] = useState(speed ?? 0)
  useEffect(() => setValue(speed ?? 0), [speed])
  if (speed == null) return null
  return (
    <div className={className}>
      <div className="flex justify-between text-body">
        <span>Speed</span>
        <span className="text-muted tabular">{value}%</span>
      </div>
      <Slider
        label={`${device.name} speed`}
        value={value}
        onChange={setValue}
        onCommit={(v) => command.mutate({ id: device.id, cmd: { fan_percent: v } })}
        disabled={disabled}
      />
    </div>
  )
}
