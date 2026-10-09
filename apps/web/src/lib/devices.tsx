import {
  Armchair,
  Bathtub,
  Bed,
  CookingPot,
  Cpu,
  Desk,
  DropHalf,
  Fan,
  Garage,
  House,
  Lamp,
  Lightbulb,
  Plant,
  Plug,
  Thermometer,
  ToggleRight,
  Wind,
  Baby,
  Television,
  type Icon,
} from '@phosphor-icons/react'
import { airQuality, formatNumber, formatWatts } from './format'
import type { Device, DeviceType } from './types'

export const deviceIcons: Record<DeviceType, Icon> = {
  switch: ToggleRight,
  plug: Plug,
  light: Lightbulb,
  air_purifier: Wind,
  fan: Fan,
  sensor: Thermometer,
  climate: DropHalf,
  cover: House,
  other: Cpu,
}

export const deviceTypeLabel: Record<DeviceType, string> = {
  switch: 'Switch',
  plug: 'Smart plug',
  light: 'Light',
  air_purifier: 'Air purifier',
  fan: 'Fan',
  sensor: 'Sensor',
  climate: 'Climate',
  cover: 'Cover',
  other: 'Device',
}

export const integrationLabel: Record<string, string> = {
  tuya: 'Smart Life',
  tapo: 'Tapo',
  xiaomi: 'Mi Home',
  mqtt: 'MQTT',
}

export const canToggle = (d: Device) => d.state.is_on !== undefined && d.device_type !== 'sensor'

/** Short one-line status shown on tiles. */
export function deviceSummary(d: Device): string {
  if (!d.is_online) return 'Offline'
  const s = d.state
  const parts: string[] = []
  if (s.is_on !== undefined && d.device_type !== 'sensor') parts.push(s.is_on ? 'On' : 'Off')
  if (d.device_type === 'light' && s.is_on && s.brightness != null) parts.push(`${s.brightness}%`)
  if (d.device_type === 'air_purifier' && s.air_quality_pm25 != null) {
    parts.push(`PM2.5 ${formatNumber(s.air_quality_pm25, 0)} · ${airQuality(s.air_quality_pm25)?.label}`)
  } else if (s.temperature != null) {
    parts.push(`${formatNumber(s.temperature)}°`)
    if (s.humidity != null) parts.push(`${formatNumber(s.humidity, 0)}%`)
  }
  if (s.current_power_watts != null && s.is_on !== false && d.device_type !== 'air_purifier') {
    parts.push(formatWatts(s.current_power_watts))
  }
  return parts.join(' · ') || 'Online'
}

const roomIconMap: [RegExp, Icon][] = [
  [/bed|master|guest/i, Bed],
  [/living|lounge|hall/i, Armchair],
  [/kitchen|dining/i, CookingPot],
  [/office|study|work/i, Desk],
  [/bath|toilet|wash/i, Bathtub],
  [/garage|car/i, Garage],
  [/garden|balcony|patio|yard/i, Plant],
  [/kid|nursery|baby/i, Baby],
  [/tv|media|theat/i, Television],
  [/lamp|light/i, Lamp],
]

export const roomIconChoices: { id: string; icon: Icon; label: string }[] = [
  { id: 'house', icon: House, label: 'Home' },
  { id: 'bed', icon: Bed, label: 'Bedroom' },
  { id: 'living', icon: Armchair, label: 'Living' },
  { id: 'kitchen', icon: CookingPot, label: 'Kitchen' },
  { id: 'office', icon: Desk, label: 'Office' },
  { id: 'bath', icon: Bathtub, label: 'Bathroom' },
  { id: 'garage', icon: Garage, label: 'Garage' },
  { id: 'garden', icon: Plant, label: 'Garden' },
  { id: 'kids', icon: Baby, label: 'Kids' },
  { id: 'media', icon: Television, label: 'Media' },
]

export function roomIcon(name: string, icon?: string | null): Icon {
  const chosen = roomIconChoices.find((c) => c.id === icon)
  if (chosen) return chosen.icon
  return roomIconMap.find(([re]) => re.test(name))?.[1] ?? House
}
