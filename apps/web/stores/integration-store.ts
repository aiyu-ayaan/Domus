// Zustand Integration Store implementation
import { create } from "zustand";
import { integrationRepository } from "@/repositories";
import type {
  IntegrationOut,
  IntegrationCreate,
  DiscoveryResult,
} from "@/types/api";

interface IntegrationState {
  integrations: IntegrationOut[];
  availableTypes: string[];
  discoveryResult: DiscoveryResult | null;
  isDiscovering: boolean;
  isLoading: boolean;
  error: string | null;

  fetchIntegrations: (homeId: string) => Promise<void>;
  fetchAvailableTypes: () => Promise<void>;
  createIntegration: (req: IntegrationCreate) => Promise<IntegrationOut>;
  deleteIntegration: (id: string) => Promise<void>;
  discoverDevices: (id: string) => Promise<DiscoveryResult>;
  clearDiscoveryResult: () => void;
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  integrations: [],
  availableTypes: [],
  discoveryResult: null,
  isDiscovering: false,
  isLoading: false,
  error: null,

  fetchIntegrations: async (homeId) => {
    set({ isLoading: true, error: null });
    try {
      const list = await integrationRepository.list(homeId);
      set({ integrations: list, isLoading: false });
    } catch (err: any) {
      set({
        isLoading: false,
        error:
          err?.error?.message || err?.message || "Failed to load integrations",
      });
    }
  },

  fetchAvailableTypes: async () => {
    try {
      const list = await integrationRepository.listAvailable();
      set({ availableTypes: list });
    } catch {}
  },

  createIntegration: async (req) => {
    set({ isLoading: true, error: null });
    try {
      const res = await integrationRepository.create(req);
      set((prev) => ({
        integrations: [...prev.integrations, res],
        isLoading: false,
      }));
      return res;
    } catch (err: any) {
      set({
        isLoading: false,
        error:
          err?.error?.message || err?.message || "Failed to create integration",
      });
      throw err;
    }
  },

  deleteIntegration: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await integrationRepository.delete(id);
      set((prev) => ({
        integrations: prev.integrations.filter((i) => i.id !== id),
        isLoading: false,
      }));
    } catch (err: any) {
      set({
        isLoading: false,
        error:
          err?.error?.message || err?.message || "Failed to delete integration",
      });
      throw err;
    }
  },

  discoverDevices: async (id) => {
    set({ isDiscovering: true, discoveryResult: null, error: null });
    try {
      const res = await integrationRepository.discover(id);
      set({ discoveryResult: res, isDiscovering: false });

      // Touch last sync timestamp on integration
      set((prev) => ({
        integrations: prev.integrations.map((item) =>
          item.id === id
            ? { ...item, last_sync_at: new Date().toISOString() }
            : item,
        ),
      }));

      return res;
    } catch (err: any) {
      set({
        isDiscovering: false,
        error: err?.error?.message || err?.message || "Discovery scan failed",
      });
      throw err;
    }
  },

  clearDiscoveryResult: () => {
    set({ discoveryResult: null });
  },
}));
