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
  // The level only drives the fan in manual mode.
  if (speed == null || device.state.mode !== 'Manual') return null
  // Rated room size is 0.07-0.12 m² per m³/h of CADR; airflow is taken as linear in speed.
  const [low, high] = device.state.fan_cadr ?? [0, 0]
  const cadr = low + ((high - low) * value) / 100
  return (
    <div className={className}>
      <div className="flex justify-between text-body">
        <span>Speed</span>
        {cadr > 0 && <span className="text-muted tabular">Coverage {Math.floor(cadr * 0.07)}–{Math.floor(cadr * 0.12)} m²</span>}
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
