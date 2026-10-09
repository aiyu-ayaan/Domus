import React from 'react';
import { GlassCard } from '../../components/GlassCard';
import { Room, Device } from '../../lib/types';
import { Home, Plus, Power } from 'lucide-react';

interface RoomsViewProps {
  rooms: Room[];
  devices: Device[];
}

export const RoomsView: React.FC<RoomsViewProps> = ({ rooms, devices }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Room Zones</h2>
          <p className="text-slate-400 text-sm">Organize devices by bedrooms, living room, kitchen, and floors.</p>
        </div>

        <button className="px-4 py-2 rounded-xl glass-button text-sm font-medium text-cyan-300 border-cyan-500/30 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Room
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {rooms.map((room) => {
          const roomDevices = devices.filter((d) => d.room_id === room.id);
          const activeDevices = roomDevices.filter((d) => {
            const state = JSON.parse(d.state_json || '{}');
            return state.is_on;
          });

          return (
            <GlassCard key={room.id} interactive className="p-5 flex flex-col justify-between h-48">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Home className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-lg">{room.name}</h4>
                    <span className="text-xs text-slate-400">Floor {room.floor}</span>
                  </div>
                </div>

                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
                  {roomDevices.length} devices
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-white/5">
                <span>{activeDevices.length} currently active</span>
                <button className="px-3 py-1.5 rounded-lg glass-button text-xs text-slate-200 hover:text-white flex items-center gap-1.5">
                  <Power className="w-3.5 h-3.5 text-cyan-400" /> Toggle Zone
                </button>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};
