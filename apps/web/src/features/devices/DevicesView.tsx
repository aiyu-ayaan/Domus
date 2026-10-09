import React, { useState } from 'react';
import { GlassCard } from '../../components/GlassCard';
import { Device } from '../../lib/types';
import { Power, Wind, Lightbulb, Plus, SlidersHorizontal, CheckCircle2 } from 'lucide-react';

interface DevicesViewProps {
  devices: Device[];
  onToggleDevice: (id: string, currentState: boolean) => void;
}

export const DevicesView: React.FC<DevicesViewProps> = ({ devices, onToggleDevice }) => {
  const [filterType, setFilterType] = useState<string>('all');

  const filtered = filterType === 'all'
    ? devices
    : devices.filter((d) => d.device_type === filterType);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Devices Management</h2>
          <p className="text-slate-400 text-sm">Control, group, and inspect all connected smart hardware.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white/[0.04] p-1 rounded-xl border border-white/10 text-xs">
            {['all', 'switch', 'light', 'air_purifier', 'plug'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                  filterType === type
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button className="px-4 py-2 rounded-xl glass-button text-sm font-medium text-cyan-300 border-cyan-500/30 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Device
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {filtered.map((device) => {
          const state = JSON.parse(device.state_json || '{}');
          const isOn = state.is_on ?? false;

          return (
            <GlassCard key={device.id} className="p-5 flex flex-col justify-between h-52">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-3 rounded-xl ${
                      isOn
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_-3px_rgba(6,182,212,0.4)]'
                        : 'bg-white/5 text-slate-400 border border-white/10'
                    }`}
                  >
                    {device.device_type === 'air_purifier' ? (
                      <Wind className="w-6 h-6" />
                    ) : device.device_type === 'light' ? (
                      <Lightbulb className="w-6 h-6" />
                    ) : (
                      <Power className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">{device.name}</h4>
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">
                      {device.integration_type}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onToggleDevice(device.id, isOn)}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isOn
                      ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.5)]'
                      : 'glass-button text-slate-400 hover:text-white'
                  }`}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>

              {/* State details & metrics */}
              <div className="bg-white/[0.02] p-3 rounded-xl border border-white/5 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Connection:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Online
                  </span>
                </div>
                {state.current_power_watts !== undefined && (
                  <div className="flex justify-between text-slate-400">
                    <span>Power Load:</span>
                    <span className="font-mono text-amber-300 font-semibold">{state.current_power_watts} W</span>
                  </div>
                )}
                {state.air_quality_pm25 !== undefined && (
                  <div className="flex justify-between text-slate-400">
                    <span>Air Quality:</span>
                    <span className="font-mono text-emerald-300 font-semibold">PM2.5 {state.air_quality_pm25} µg/m³</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center text-xs text-slate-400 pt-1">
                <span>Model: {device.model || 'Standard IoT'}</span>
                <button className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Config
                </button>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};
