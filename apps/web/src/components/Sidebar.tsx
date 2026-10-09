import React from 'react';
import { LayoutDashboard, Cpu, Home, Workflow, Zap, Puzzle } from 'lucide-react';

export type NavTab = 'dashboard' | 'devices' | 'rooms' | 'automations' | 'energy' | 'plugins';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const items: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'devices', label: 'Devices', icon: <Cpu className="w-5 h-5" /> },
    { id: 'rooms', label: 'Rooms', icon: <Home className="w-5 h-5" /> },
    { id: 'automations', label: 'Automations', icon: <Workflow className="w-5 h-5" /> },
    { id: 'energy', label: 'Energy & Bill', icon: <Zap className="w-5 h-5" /> },
    { id: 'plugins', label: 'Integrations', icon: <Puzzle className="w-5 h-5" /> },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-white/10 flex flex-col justify-between p-4 h-[calc(100vh-4rem)]">
      <nav className="space-y-1.5">
        {items.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <span className={isActive ? 'text-cyan-400' : 'text-slate-400'}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-slate-400 space-y-1">
        <div className="flex justify-between items-center">
          <span>Engine</span>
          <span className="font-mono text-cyan-400">v0.1.0-alpha</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Database</span>
          <span className="font-mono text-emerald-400">SQLite (Encrypted)</span>
        </div>
      </div>
    </aside>
  );
};
