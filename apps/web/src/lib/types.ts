export type Role = 'admin' | 'member' | 'guest'

export interface User {
  id: string
  username: string
  email: string
  role: Role
  all_rooms: boolean
  room_ids: string[]
  created_at: string
}

export type DeviceType =
  | 'switch'
  | 'plug'
  | 'light'
  | 'air_purifier'
  | 'fan'
  | 'sensor'
  | 'climate'
  | 'cover'
  | 'other'

export interface DeviceState {
  is_on?: boolean
  brightness?: number
  color_temp?: number
  temperature?: number
  humidity?: number
  air_quality_pm25?: number
  fan_speed?: string
  mode?: string
  filter_life?: number
  current_power_watts?: number
  voltage?: number
  current_amps?: number
  today_energy_kwh?: number
  options?: Record<string, string[]>
  [extra: string]: unknown
}

export interface Device {
  id: string
  name: string
  room_id: string | null
  integration_type: string
  device_type: DeviceType
  model: string | null
  ip_address: string | null
  mac_address: string | null
  icon: string | null
  is_online: boolean
  state: DeviceState
  last_seen: string | null
  created_at: string
}

export type DeviceCommand = Partial<{
  is_on: boolean
  brightness: number
  color_temp: number
  fan_speed: string
  mode: string
  raw: unknown
}>

export interface Discovered {
  id: string
  integration_type: string
  external_id: string
  account_id: string | null
  name: string
  device_type: DeviceType
  model: string | null
  ip_address: string | null
  mac_address: string | null
  note: string | null
  status: 'pending' | 'ignored' | 'adopted'
  discovered_at: string
  last_seen: string
}

export interface DiscoverySettings {
  enabled: boolean
  interval_minutes: number
  auto_adopt: boolean
  notify: boolean
}

export interface DiscoveryReport {
  found: number
  new: number
  adopted: number
  errors: { integration: string; message: string }[]
}

export interface Room {
  id: string
  name: string
  icon: string | null
  floor: number
}

export interface Group {
  id: string
  name: string
  description: string | null
  device_ids: string[]
}

export interface Account {
  id: string
  integration_type: string
  name: string
  status: 'ok' | 'error'
  last_error: string | null
  created_at: string
}

export interface Integration {
  id: string
  name: string
  description: string
  link: 'qr' | 'credentials' | 'none'
  local: boolean
  enabled: boolean
  accounts: Account[]
  device_count: number
}

export interface Comparison {
  equals?: unknown
  above?: number
  below?: number
}

export type Trigger =
  | ({ type: 'device_state'; device_id: string; property: string } & Comparison)
  | { type: 'time'; at: string; days: number[] }
  | { type: 'power_above'; device_id: string; watts: number }
  | { type: 'device_discovered' }
  | { type: 'device_offline'; device_id: string }

export type Condition =
  | ({ type: 'device_state'; device_id: string; property: string } & Comparison)
  | { type: 'time_between'; start: string; end: string }

export type Action =
  | { type: 'device_command'; device_id: string; command: DeviceCommand }
  | { type: 'group_command'; group_id: string; command: DeviceCommand }
  | { type: 'notify'; title: string; message: string }
  | { type: 'scene'; scene_id: string }
  | { type: 'delay'; seconds: number }

export interface Automation {
  id: string
  name: string
  description: string | null
  triggers: Trigger[]
  conditions: Condition[]
  actions: Action[]
  is_enabled: boolean
  last_triggered_at: string | null
  created_at: string
}

export interface Scene {
  id: string
  name: string
  icon: string | null
  actions: Action[]
  is_active: boolean
}

export interface ElectricitySettings {
  rate_per_kwh: number
  currency: string
  monthly_budget: number | null
  billing_cycle_day: number
  fixed_monthly_charge: number
}

export interface EnergyOverview {
  current_watts: number
  today_kwh: number
  today_cost: number
  cycle_start: string
  cycle_days: number
  cycle_day: number
  cycle_kwh: number
  cycle_cost: number
  projected_kwh: number
  projected_cost: number
  budget_used_percent: number | null
  settings: ElectricitySettings
  devices: { device_id: string; name: string; current_watts: number; kwh: number; cost: number }[]
}

export interface EnergyPoint {
  t: string
  kwh: number
  cost: number
}

export interface Notification {
  id: string
  level: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
}

export type LiveEvent =
  | { type: 'connected' | 'resync' | 'integrations_changed' | 'rooms_changed' }
  | { type: 'device_state_changed'; device_id: string; state: DeviceState; is_online: boolean }
  | { type: 'device_added' | 'device_updated' | 'device_removed'; device_id: string }
  | { type: 'device_discovered'; discovery_id: string; name: string; integration: string }
  | { type: 'discovery_finished'; found: number; new: number }
  | { type: 'notification'; id: string; level: Notification['level']; title: string; message: string }
  | { type: 'automation_triggered'; automation_id: string; name: string }
