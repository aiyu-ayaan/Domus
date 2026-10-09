import React from 'react';
import { Bell, ShieldCheck, Zap } from 'lucide-react';

interface HeaderProps {
  totalWatts: number;
}

export const Header: React.FC<HeaderProps> = ({ totalWatts }) => {
  return (
    <header className="h-16 px-6 glass-panel border-b border-white/10 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
          Docus Core
        </h1>
        <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          ONLINE
        </span>
      </div>

      <div className="flex items-center space-x-4">
        {/* Live Power Indicator */}
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10">
          <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="text-xs text-slate-400">Total Power:</span>
          <span className="text-sm font-semibold font-mono text-cyan-300">
            {totalWatts.toFixed(0)} W
          </span>
        </div>

        {/* Security / System status */}
        <button className="p-2 rounded-xl glass-button text-slate-300 hover:text-white" title="Security Status">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
        </button>

        {/* Notifications */}
        <button className="p-2 rounded-xl glass-button text-slate-300 hover:text-white relative" title="Notifications">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400" />
        </button>
      </div>
    </header>
  );
};
