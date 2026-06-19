// Zustand Automation Store implementation
import { create } from 'zustand';
import { automationRepository } from '@/repositories';
import type { AutomationOut, AutomationCreate, AutomationUpdate, AutomationRunResult } from '@/types/api';

interface AutomationState {
    automations: AutomationOut[];
    isLoading: boolean;
    error: string | null;

    fetchAutomations: (homeId: string) => Promise<void>;
    createAutomation: (req: AutomationCreate) => Promise<AutomationOut>;
    updateAutomation: (id: string, req: AutomationUpdate) => Promise<AutomationOut>;
    deleteAutomation: (id: string) => Promise<void>;
    triggerAutomation: (id: string, context?: Record<string, any>) => Promise<AutomationRunResult>;
    toggleAutomation: (id: string, enabled: boolean) => Promise<void>;
}

export const useAutomationStore = create<AutomationState>((set, get) => ({
    automations: [],
    isLoading: false,
    error: null,

    fetchAutomations: async (homeId) => {
        set({ isLoading: true, error: null });
        try {
            const list = await automationRepository.list(homeId);
            set({ automations: list, isLoading: false });
        } catch (err: any) {
            set({ isLoading: false, error: err?.error?.message || err?.message || 'Failed to load automations' });
        }
    },

    createAutomation: async (req) => {
        set({ isLoading: true, error: null });
        try {
            const res = await automationRepository.create(req);
            set((prev) => ({
                automations: [...prev.automations, res],
                isLoading: false,
            }));
            return res;
        } catch (err: any) {
            set({ isLoading: false, error: err?.error?.message || err?.message || 'Failed to create automation' });
            throw err;
        }
    },

    updateAutomation: async (id, req) => {
        set({ isLoading: true, error: null });
        try {
            const res = await automationRepository.update(id, req);
            set((prev) => ({
                automations: prev.automations.map((a) => (a.id === id ? res : a)),
                isLoading: false,
            }));
            return res;
        } catch (err: any) {
            set({ isLoading: false, error: err?.error?.message || err?.message || 'Failed to update automation' });
            throw err;
        }
    },

    deleteAutomation: async (id) => {
        set({ isLoading: true, error: null });
        try {
            await automationRepository.delete(id);
            set((prev) => ({
                automations: prev.automations.filter((a) => a.id !== id),
                isLoading: false,
            }));
        } catch (err: any) {
            set({ isLoading: false, error: err?.error?.message || err?.message || 'Failed to delete automation' });
            throw err;
        }
    },

    triggerAutomation: async (id, context) => {
        try {
            const res = await automationRepository.trigger(id, context);
            // Refresh list to update last triggered details in UI
            const activeHomeId = get().automations.find((a) => a.id === id)?.home_id;
            if (activeHomeId) {
                get().fetchAutomations(activeHomeId).catch(() => {});
            }
            return res;
        } catch (err) {
            throw err;
        }
    },

    toggleAutomation: async (id, enabled) => {
        // Optimistically toggle state in UI
        set((prev) => ({
            automations: prev.automations.map((a) => (a.id === id ? { ...a, enabled } : a)),
        }));

        try {
            await automationRepository.update(id, { enabled });
        } catch (err) {
            // Revert state on error
            set((prev) => ({
                automations: prev.automations.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a)),
            }));
            throw err;
        }
    },
}));
