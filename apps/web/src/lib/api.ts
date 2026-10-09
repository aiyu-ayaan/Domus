import { Device, Room, EnergyOverview, ElectricitySettings, Automation } from './types';

const BASE_URL = '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('docus_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async getSetupStatus(): Promise<{ needs_admin_setup: boolean }> {
    const res = await fetch(`${BASE_URL}/auth/setup-status`);
    return res.json();
  },

  async register(data: { username: string; email: string; password: string }): Promise<{ token: string; user: unknown }> {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async login(data: { username: string; password: string }): Promise<{ token: string; user: unknown }> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getDevices(): Promise<Device[]> {
    const res = await fetch(`${BASE_URL}/devices`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async updateDeviceState(id: string, state: Record<string, unknown>): Promise<void> {
    await fetch(`${BASE_URL}/devices/${id}/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ state }),
    });
  },

  async getRooms(): Promise<Room[]> {
    const res = await fetch(`${BASE_URL}/rooms`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async getEnergyOverview(): Promise<EnergyOverview> {
    const res = await fetch(`${BASE_URL}/energy/overview`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) {
      return {
        current_total_watts: 0,
        total_kwh_month: 0,
        estimated_cost_month: 0,
        rate_per_kwh: 0.15,
        currency: 'USD',
      };
    }
    return res.json();
  },

  async getElectricitySettings(): Promise<ElectricitySettings> {
    const res = await fetch(`${BASE_URL}/energy/settings`, {
      headers: getAuthHeader(),
    });
    return res.json();
  },

  async updateElectricitySettings(settings: Partial<ElectricitySettings>): Promise<ElectricitySettings> {
    const res = await fetch(`${BASE_URL}/energy/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(settings),
    });
    return res.json();
  },

  async getAutomations(): Promise<Automation[]> {
    const res = await fetch(`${BASE_URL}/automations`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async createTuyaQrSession(): Promise<{ session_id: string; qr_code_url: string; expires_in_secs: number }> {
    const res = await fetch(`${BASE_URL}/integrations/tuya/qr-session`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
    return res.json();
  },
};
