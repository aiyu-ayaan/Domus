import React, { useState } from 'react';
import { GlassCard } from '../../components/GlassCard';
import { EnergyOverview, ElectricitySettings, Device } from '../../lib/types';
import { Zap, DollarSign, Settings2, Check } from 'lucide-react';

interface EnergyViewProps {
  energy: EnergyOverview;
  settings: ElectricitySettings;
  devices: Device[];
  onSaveSettings: (settings: Partial<ElectricitySettings>) => Promise<void>;
}

export const EnergyView: React.FC<EnergyViewProps> = ({
  energy,
  settings,
  devices,
  onSaveSettings,
}) => {
  const [rate, setRate] = useState<number>(settings.rate_per_kwh || 0.15);
  const [currency, setCurrency] = useState<string>(settings.currency || 'USD');
  const [budget, setBudget] = useState<number>(settings.monthly_budget || 100);
  const [saved, setSaved] = useState<boolean>(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings({
      rate_per_kwh: rate,
      currency,
      monthly_budget: budget,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Energy & Electricity Tariff</h2>
        <p className="text-slate-400 text-sm">
          Live wattage measurement, automated bill estimations, and rate calculations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bill Forecast & Live Load */}
        <div className="space-y-6">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-400">Total Live Load</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold font-mono text-cyan-300">
                    {energy.current_total_watts.toFixed(0)}
                  </span>
                  <span className="text-slate-400 font-medium">Watts</span>
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Zap className="w-8 h-8" />
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Monthly Usage to Date</span>
                <span className="font-mono font-semibold text-white">{energy.total_kwh_month.toFixed(1)} kWh</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Projected Month Cost</span>
                <span className="font-mono font-semibold text-cyan-400">
                  {energy.currency} {energy.estimated_cost_month.toFixed(2)}
                </span>
              </div>
              {energy.budget_used_percent !== undefined && (
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                    <span>Monthly Budget Limit ({energy.currency} {energy.monthly_budget})</span>
                    <span>{energy.budget_used_percent.toFixed(0)}% used</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        energy.budget_used_percent > 90 ? 'bg-rose-500' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(energy.budget_used_percent, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Breakdown by device */}
          <GlassCard className="p-6">
            <h3 className="font-semibold text-white mb-4">Device Power Metrics</h3>
            <div className="space-y-3">
              {devices.map((device) => {
                const state = JSON.parse(device.state_json || '{}');
                const watts = state.current_power_watts ?? 0;
                return (
                  <div key={device.id} className="flex justify-between items-center text-sm p-2 rounded-lg bg-white/[0.02]">
                    <span className="text-slate-300">{device.name}</span>
                    <span className="font-mono text-amber-300 font-medium">{watts} W</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>

        {/* Electricity Bill Tariff Configuration */}
        <div>
          <GlassCard className="p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Settings2 className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-white text-lg">Tariff Configuration</h3>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Electricity Rate per kWh
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <div className="absolute right-3 top-2.5 text-xs text-slate-400">{currency}/kWh</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Currency Symbol / Code
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Monthly Budget Target ({currency})
                </label>
                <input
                  type="number"
                  step="1"
                  value={budget}
                  onChange={(e) => setBudget(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl glass-button text-cyan-300 font-semibold border-cyan-500/30 flex items-center justify-center gap-2"
                >
                  {saved ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Tariff Settings Saved</span>
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      <span>Save Tariff Configuration</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
