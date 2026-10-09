import React from 'react';
import { GlassCard } from '../../components/GlassCard';
import { Automation } from '../../lib/types';
import { Workflow, Plus, Zap, Clock, ShieldAlert } from 'lucide-react';

interface AutomationsViewProps {
  automations: Automation[];
}

export const AutomationsView: React.FC<AutomationsViewProps> = ({ automations }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Smart Automations</h2>
          <p className="text-slate-400 text-sm">Create triggers, environmental conditions, and multi-device routines.</p>
        </div>

        <button className="px-4 py-2 rounded-xl glass-button text-sm font-medium text-cyan-300 border-cyan-500/30 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Automation
        </button>
      </div>

      <div className="space-y-4">
        {automations.map((item) => {
          return (
            <GlassCard key={item.id} className="p-5 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  <Workflow className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-base">{item.name}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{item.description || 'Configured automation routine'}</p>
                  
                  <div className="flex items-center gap-3 mt-2 text-xs font-mono text-slate-400">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-400" /> State Trigger
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" /> Active Schedule
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    item.is_enabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/5 text-slate-400 border-white/10'
                  }`}
                >
                  {item.is_enabled ? 'ENABLED' : 'PAUSED'}
                </button>
              </div>
            </GlassCard>
          );
        })}

        {automations.length === 0 && (
          <GlassCard className="p-8 text-center">
            <ShieldAlert className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <h4 className="text-base font-semibold text-white">No Automations Configured Yet</h4>
            <p className="text-sm text-slate-400 mt-1">
              Add your first smart rule, e.g. "Turn off switches when room power exceeds 2000W".
            </p>
          </GlassCard>
        )}
      </div>
    </div>
  );
};
