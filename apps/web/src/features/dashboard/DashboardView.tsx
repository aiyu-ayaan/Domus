import React from 'react';
import { GlassCard } from '../../components/GlassCard';
import { Device, EnergyOverview } from '../../lib/types';
import { Power, Wind, Lightbulb, Zap, TrendingUp, Sparkles } from 'lucide-react';

interface DashboardViewProps {
  devices: Device[];
  energy: EnergyOverview;
  onToggleDevice: (id: string, currentState: boolean) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  devices,
  energy,
  onToggleDevice,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Welcome / Scene Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Smart Living Space</h2>
          <p className="text-slate-400 text-sm">Welcome home. All automated systems active.</p>
        </div>

        <div className="flex items-center space-x-3">
          <button className="px-4 py-2 rounded-xl glass-button text-sm font-medium text-slate-200 hover:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Relax Mode
          </button>
          <button className="px-4 py-2 rounded-xl glass-button text-sm font-medium text-slate-200 hover:text-white flex items-center gap-2">
            <Power className="w-4 h-4 text-rose-400" />
            All Off
          </button>
        </div>
      </div>

      {/* Energy Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Current Power Draw</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-white">
              {energy.current_total_watts.toFixed(0)}
            </span>
            <span className="text-slate-400 font-medium">Watts</span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1 font-mono">
            <span>● 12% lower than usual peak</span>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Month Electricity Bill Est.</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-white">
              {energy.currency} {energy.estimated_cost_month.toFixed(2)}
            </span>
            <span className="text-slate-400 font-medium">({energy.total_kwh_month.toFixed(1)} kWh)</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Rate: {energy.currency} {energy.rate_per_kwh.toFixed(2)} / kWh
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Online Smart Devices</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Power className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-white">
              {devices.filter((d) => d.is_online).length}
            </span>
            <span className="text-slate-400 font-medium">/ {devices.length} Total</span>
          </div>
          <div className="mt-2 text-xs text-cyan-400">
            Across {new Set(devices.map((d) => d.room_id).filter(Boolean)).size || 1} Rooms
          </div>
        </GlassCard>
      </div>

      {/* Featured Devices Section */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Interactive Devices</h3>
          <span className="text-xs text-slate-400">Tap to toggle state</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {devices.map((device) => {
            const state = JSON.parse(device.state_json || '{}');
            const isOn = state.is_on ?? false;

            return (
              <GlassCard
                key={device.id}
                interactive
                onClick={() => onToggleDevice(device.id, isOn)}
                className="p-5 flex flex-col justify-between h-44"
              >
                <div className="flex justify-between items-start">
                  <div
                    className={`p-3 rounded-xl transition-colors duration-300 ${
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

                  <span
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                      isOn
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-white/5 text-slate-400 border-white/10'
                    }`}
                  >
                    {isOn ? 'ON' : 'OFF'}
                  </span>
                </div>

                <div>
                  <h4 className="font-semibold text-white text-base tracking-tight">{device.name}</h4>
                  <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                    <span className="capitalize">{device.device_type.replace('_', ' ')}</span>
                    {state.current_power_watts !== undefined && (
                      <span className="font-mono text-amber-300 font-medium">
                        {state.current_power_watts} W
                      </span>
                    )}
                    {state.air_quality_pm25 !== undefined && (
                      <span className="font-mono text-emerald-300 font-medium">
                        PM2.5: {state.air_quality_pm25}
                      </span>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};
