export type Role = 'admin' | 'member' | 'guest'

export interface User {
  id: string
  username: string
  email: string
  role: Role
  avatar?: string
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
  color?: string
  color_mode?: string
  /** Id of the light effect the device is playing, if any. */
  effect?: string
  temperature?: number
  humidity?: number
  air_quality_pm25?: number
  fan_speed?: string
  /** 0-100 %, for fans with a stepless speed. */
  fan_percent?: number
  /** Clean air delivery rate at full speed, m³/h. */
  fan_cadr?: number
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
  color: string
  color_mode: string
  fan_speed: string
  fan_percent: number
  mode: string
  /** A mood or effect id; '' stops a running effect. */
  effect: string
  raw: unknown
}>

export interface LightPreset {
  id: string
  name: string
  /** Preview colours: one for a mood, the loop for an effect. */
  colors: string[]
  brightness?: number
  color_temp?: number
}

export interface EffectCatalog {
  moods: LightPreset[]
  effects: LightPreset[]
}

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

export type SceneKind = 'standard' | 'screen_sync'

/** Settings of a Screen Sync scene (mirrors the shared screen's colour onto lights). */
export interface ScreenSyncConfig {
  device_ids: string[]
  group_ids: string[]
  /** vivid: most saturated dominant hue · dominant: most common colour · average: mean colour */
  style: 'vivid' | 'dominant' | 'average'
  region: 'full' | 'edges'
  follow_brightness: boolean
  min_brightness: number
  max_brightness: number
  /** 0 = instant, 100 = very smooth */
  smoothing: number
  fps: number
  restore_on_stop: boolean
}

export interface Scene {
  id: string
  name: string
  icon: string | null
  actions: Action[]
  is_active: boolean
  kind: SceneKind
  /** `ScreenSyncConfig` for screen_sync scenes, `{}` otherwise. */
  config: Partial<ScreenSyncConfig>
}

export interface ElectricitySettings {
  rate_per_kwh: number
  currency: string
  monthly_budget: number | null
  billing_cycle_day: number
  fixed_monthly_charge: number
  /** Usage slabs per billing cycle; empty = flat rate_per_kwh. */
  slabs: { up_to_kwh: number | null; rate: number }[]
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
  /** Average measured power; null where nothing was measured. */
  watts: number | null
}

/** Averages of one hour / day; null where nothing was measured. */
export interface AirPoint {
  t: string
  pm25: number | null
  temperature: number | null
  humidity: number | null
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
  | { type: 'connected' | 'resync' | 'integrations_changed' | 'rooms_changed' | 'users_changed' | 'notifications_changed' }
  | { type: 'user_updated'; user_id: string; username: string; role: string; avatar?: string }
  | { type: 'device_state_changed'; device_id: string; state: DeviceState; is_online: boolean }
  | { type: 'device_added' | 'device_updated' | 'device_removed'; device_id: string }
  | { type: 'device_discovered'; discovery_id: string; name: string; integration: string }
  | { type: 'discovery_finished'; found: number; new: number }
  | { type: 'notification'; id: string; level: Notification['level']; title: string; message: string }
  | { type: 'automation_triggered'; automation_id: string; name: string }

/** Where clients reach the server: at home and from outside. */
export interface ServerLinks {
  local_url: string
  remote_url: string
  /** SHA-256 of the server's own certificate; null when TLS is off. */
  fingerprint: string | null
}
