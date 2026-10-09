import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { DashboardView } from './features/dashboard/DashboardView';
import { DevicesView } from './features/devices/DevicesView';
import { RoomsView } from './features/rooms/RoomsView';
import { AutomationsView } from './features/automations/AutomationsView';
import { EnergyView } from './features/energy/EnergyView';
import { PluginsView } from './features/plugins/PluginsView';
import { api } from './lib/api';
import { Device, Room, EnergyOverview, ElectricitySettings, Automation } from './lib/types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  const [devices, setDevices] = useState<Device[]>([
    {
      id: 'dev-1',
      name: 'Living Room Smart Switch',
      room_id: 'room-1',
      integration_type: 'tuya',
      device_type: 'switch',
      model: 'Tuya TS0001',
      config_json: '{}',
      state_json: JSON.stringify({ is_on: true, current_power_watts: 145 }),
      is_online: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-2',
      name: 'Bedroom Air Purifier',
      room_id: 'room-2',
      integration_type: 'xiaomi',
      device_type: 'air_purifier',
      model: 'Mi Air Purifier 4 Pro',
      config_json: '{}',
      state_json: JSON.stringify({ is_on: true, fan_speed: 'auto', air_quality_pm25: 12, current_power_watts: 32 }),
      is_online: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dev-3',
      name: 'Kitchen Ambient Light',
      room_id: 'room-3',
      integration_type: 'tapo',
      device_type: 'light',
      model: 'Tapo L530E',
      config_json: '{}',
      state_json: JSON.stringify({ is_on: false, brightness: 80, current_power_watts: 0 }),
      is_online: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const [rooms] = useState<Room[]>([
    { id: 'room-1', name: 'Living Room', floor: 1, created_at: '', updated_at: '' },
    { id: 'room-2', name: 'Master Bedroom', floor: 2, created_at: '', updated_at: '' },
    { id: 'room-3', name: 'Kitchen', floor: 1, created_at: '', updated_at: '' },
  ]);

  const [energy, setEnergy] = useState<EnergyOverview>({
    current_total_watts: 177,
    total_kwh_month: 238.4,
    estimated_cost_month: 35.76,
    rate_per_kwh: 0.15,
    currency: 'USD',
    monthly_budget: 80,
    budget_used_percent: 44.7,
  });

  const [settings, setSettings] = useState<ElectricitySettings>({
    id: 'settings-1',
    rate_per_kwh: 0.15,
    currency: 'USD',
    monthly_budget: 80,
    billing_cycle_day: 1,
    updated_at: new Date().toISOString(),
  });

  const [automations] = useState<Automation[]>([
    {
      id: 'auto-1',
      name: 'Clean Air on High PM2.5',
      description: 'Boost Bedroom Air Purifier to Max when PM2.5 exceeds 35',
      triggers_json: '[]',
      conditions_json: '[]',
      actions_json: '[]',
      is_enabled: true,
      created_at: '',
    },
    {
      id: 'auto-2',
      name: 'Peak Power Limiter',
      description: 'Turn off standby switches when current consumption exceeds 2500W',
      triggers_json: '[]',
      conditions_json: '[]',
      actions_json: '[]',
      is_enabled: true,
      created_at: '',
    },
  ]);

  useEffect(() => {
    // Attempt backend fetch if running
    api.getDevices().then((remote) => {
      if (remote && remote.length > 0) {
        setDevices(remote);
      }
    }).catch(() => {});

    api.getEnergyOverview().then((overview) => {
      if (overview && overview.current_total_watts > 0) {
        setEnergy(overview);
      }
    }).catch(() => {});
  }, []);

  const handleToggleDevice = (id: string, currentState: boolean) => {
    const updated = devices.map((d) => {
      if (d.id === id) {
        const state = JSON.parse(d.state_json || '{}');
        const newState = {
          ...state,
          is_on: !currentState,
          current_power_watts: !currentState ? (state.current_power_watts || 45) : 0,
        };
        api.updateDeviceState(id, newState).catch(() => {});
        return {
          ...d,
          state_json: JSON.stringify(newState),
        };
      }
      return d;
    });

    setDevices(updated);

    // Recalculate total watts
    const newTotalWatts = updated.reduce((acc, d) => {
      const state = JSON.parse(d.state_json || '{}');
      return acc + (state.is_on ? (state.current_power_watts || 0) : 0);
    }, 0);

    setEnergy((prev) => ({
      ...prev,
      current_total_watts: newTotalWatts,
    }));
  };

  const handleSaveSettings = async (newSettings: Partial<ElectricitySettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
    if (newSettings.rate_per_kwh !== undefined) {
      setEnergy((prev) => ({
        ...prev,
        rate_per_kwh: newSettings.rate_per_kwh!,
        currency: newSettings.currency || prev.currency,
        estimated_cost_month: prev.total_kwh_month * newSettings.rate_per_kwh!,
      }));
    }
    await api.updateElectricitySettings(newSettings).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] flex flex-col selection:bg-cyan-500/30">
      {/* Background radial specular glow */}
      <div className="fixed top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-cyan-600/10 blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-600/10 blur-[140px] pointer-events-none" />

      <Header totalWatts={energy.current_total_watts} />

      <div className="flex-1 flex overflow-hidden relative z-10">
        <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

        <main className="flex-1 p-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {currentTab === 'dashboard' && (
            <DashboardView
              devices={devices}
              energy={energy}
              onToggleDevice={handleToggleDevice}
            />
          )}

          {currentTab === 'devices' && (
            <DevicesView
              devices={devices}
              onToggleDevice={handleToggleDevice}
            />
          )}

          {currentTab === 'rooms' && (
            <RoomsView
              rooms={rooms}
              devices={devices}
            />
          )}

          {currentTab === 'automations' && (
            <AutomationsView automations={automations} />
          )}

          {currentTab === 'energy' && (
            <EnergyView
              energy={energy}
              settings={settings}
              devices={devices}
              onSaveSettings={handleSaveSettings}
            />
          )}

          {currentTab === 'plugins' && <PluginsView />}
        </main>
      </div>
    </div>
  );
};

export default App;
