export type IntegrationType = 'tuya' | 'tapo' | 'xiaomi' | 'mqtt' | 'zigbee' | 'esp32' | 'virtual';

export type DeviceType = 'switch' | 'light' | 'plug' | 'air_purifier' | 'sensor' | 'climate';

export interface DeviceState {
  is_on?: boolean;
  brightness?: number;
  color_temp?: number;
  temperature?: number;
  humidity?: number;
  air_quality_pm25?: number;
  fan_speed?: string;
  current_power_watts?: number;
  total_energy_kwh?: number;
  [key: string]: unknown;
}

export interface Device {
  id: string;
  name: string;
  room_id?: string;
  integration_type: IntegrationType;
  device_type: DeviceType;
  model?: string;
  ip_address?: string;
  mac_address?: string;
  config_json: string;
  state_json: string;
  is_online: boolean;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  name: string;
  icon?: string;
  floor: number;
  created_at: string;
  updated_at: string;
}

export interface EnergyOverview {
  current_total_watts: number;
  total_kwh_month: number;
  estimated_cost_month: number;
  rate_per_kwh: number;
  currency: string;
  monthly_budget?: number;
  budget_used_percent?: number;
}

export interface ElectricitySettings {
  id: string;
  rate_per_kwh: number;
  currency: string;
  monthly_budget?: number;
  billing_cycle_day: number;
  updated_at: string;
}

export interface Automation {
  id: string;
  name: string;
  description?: string;
  triggers_json: string;
  conditions_json: string;
  actions_json: string;
  is_enabled: boolean;
  created_at: string;
}
