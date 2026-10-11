import { t } from '@/lib/i18n'
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
  switch: t('device.type.switch'),
  plug: t('device.type.plug'),
  light: t('device.type.light'),
  air_purifier: t('device.type.air_purifier'),
  fan: t('device.type.fan'),
  sensor: t('device.type.sensor'),
  climate: t('device.type.climate'),
  cover: t('device.type.cover'),
  other: t('device.type.other'),
}

export const integrationLabel: Record<string, string> = {
  tuya: 'Smart Life',
  tapo: 'Tapo',
  xiaomi: 'Mi Home',
  mqtt: 'MQTT',
  hue: 'Hue',
}

export const canToggle = (d: Device) => d.state.is_on !== undefined && d.device_type !== 'sensor'

/** Short one-line status shown on tiles. */
export function deviceSummary(d: Device): string {
  if (!d.is_online) return t('device.offline')
  const s = d.state
  const parts: string[] = []
  if (s.is_on !== undefined && d.device_type !== 'sensor') parts.push(t(s.is_on ? 'device.on' : 'device.off'))
  if (d.device_type === 'light' && s.is_on && s.brightness != null) parts.push(`${s.brightness}%`)
  if (d.device_type === 'air_purifier' && s.air_quality_pm25 != null) {
    parts.push(t('device.pm25Summary', { value: formatNumber(s.air_quality_pm25, 0), label: airQuality(s.air_quality_pm25)?.label ?? '' }))
  } else if (s.temperature != null) {
    parts.push(`${formatNumber(s.temperature)}°`)
    if (s.humidity != null) parts.push(`${formatNumber(s.humidity, 0)}%`)
  }
  // Sensors without a reading of their own say what they last saw.
  if (typeof s.motion === 'boolean') parts.push(t(s.motion ? 'device.motion' : 'device.clear'))
  if (typeof s.contact === 'boolean') parts.push(t(s.contact ? 'device.open' : 'device.closed'))
  if (s.water_leak === true) parts.push(t('device.leak'))
  if (s.current_power_watts != null && s.is_on !== false && d.device_type !== 'air_purifier') {
    parts.push(formatWatts(s.current_power_watts))
  }
  return parts.join(' · ') || t('device.online')
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
  { id: 'house', icon: House, label: t('room.icon.house') },
  { id: 'bed', icon: Bed, label: t('room.icon.bed') },
  { id: 'living', icon: Armchair, label: t('room.icon.living') },
  { id: 'kitchen', icon: CookingPot, label: t('room.icon.kitchen') },
  { id: 'office', icon: Desk, label: t('room.icon.office') },
  { id: 'bath', icon: Bathtub, label: t('room.icon.bath') },
  { id: 'garage', icon: Garage, label: t('room.icon.garage') },
  { id: 'garden', icon: Plant, label: t('room.icon.garden') },
  { id: 'kids', icon: Baby, label: t('room.icon.kids') },
  { id: 'media', icon: Television, label: t('room.icon.media') },
]

export function roomIcon(name: string, icon?: string | null): Icon {
  const chosen = roomIconChoices.find((c) => c.id === icon)
  if (chosen) return chosen.icon
  return roomIconMap.find(([re]) => re.test(name))?.[1] ?? House
}
