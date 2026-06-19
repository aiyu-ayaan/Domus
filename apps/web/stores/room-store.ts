// Zustand Room Store implementation
import { create } from 'zustand';
import { roomRepository } from '@/repositories';
import type { RoomOut, RoomCreate, RoomUpdate } from '@/types/api';

interface RoomState {
    rooms: RoomOut[];
    isLoading: boolean;
    error: string | null;

    fetchRooms: (homeId: string) => Promise<void>;
    createRoom: (req: RoomCreate) => Promise<RoomOut>;
    updateRoom: (id: string, req: RoomUpdate) => Promise<RoomOut>;
    deleteRoom: (id: string) => Promise<void>;
}

export const useRoomStore = create<RoomState>((set) => ({
    rooms: [],
    isLoading: false,
    error: null,

    fetchRooms: async (homeId) => {
        set({ isLoading: true, error: null });
        try {
            const list = await roomRepository.list(homeId);
            set({ rooms: list, isLoading: false });
        } catch (err: any) {
            set({ isLoading: false, error: err?.error?.message || err?.message || 'Failed to load rooms' });
        }
    },

    createRoom: async (req) => {
        set({ isLoading: true, error: null });
        try {
            const newRoom = await roomRepository.create(req);
            set((state) => ({
                rooms: [...state.rooms, newRoom],
                isLoading: false,
            }));
            return newRoom;
        } catch (err: any) {
            set({ isLoading: false, error: err?.error?.message || err?.message || 'Failed to create room' });
            throw err;
        }
    },

    updateRoom: async (id, req) => {
        set({ isLoading: true, error: null });
        try {
            const updated = await roomRepository.update(id, req);
            set((state) => ({
                rooms: state.rooms.map((r) => (r.id === id ? updated : r)),
                isLoading: false,
            }));
            return updated;
        } catch (err: any) {
            set({ isLoading: false, error: err?.error?.message || err?.message || 'Failed to update room' });
            throw err;
        }
    },

    deleteRoom: async (id) => {
        set({ isLoading: true, error: null });
        try {
            await roomRepository.delete(id);
            set((state) => ({
                rooms: state.rooms.filter((r) => r.id !== id),
                isLoading: false,
            }));
        } catch (err: any) {
            set({ isLoading: false, error: err?.error?.message || err?.message || 'Failed to delete room' });
            throw err;
        }
    },
}));
