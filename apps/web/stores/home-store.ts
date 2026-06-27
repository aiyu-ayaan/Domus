// Zustand Home Store implementation
import { create } from "zustand";
import { homeRepository } from "@/repositories";
import type { HomeOut, HomeCreate, HomeUpdate } from "@/types/api";
import { hydrateTariffCache } from "@/lib/energy";

interface HomeState {
  homes: HomeOut[];
  activeHomeId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchHomes: () => Promise<void>;
  setActiveHomeId: (id: string) => void;
  createHome: (req: HomeCreate) => Promise<HomeOut>;
  updateHome: (id: string, req: HomeUpdate) => Promise<HomeOut>;
  deleteHome: (id: string) => Promise<void>;
}

export const useHomeStore = create<HomeState>((set, get) => ({
  homes: [],
  activeHomeId: null,
  isLoading: false,
  error: null,

  fetchHomes: async () => {
    set({ isLoading: true, error: null });
    try {
      const list = await homeRepository.list();
      set({ homes: list, isLoading: false });
      // Mirror each home's synced tariff into the local cache the readers use.
      list.forEach((h) => hydrateTariffCache(h.id, h.billing_settings));

      // Auto select active home if none selected
      if (list.length > 0 && !get().activeHomeId) {
        const stored =
          typeof window !== "undefined"
            ? localStorage.getItem("domus_active_home_id")
            : null;
        const matchesStored = stored && list.some((h) => h.id === stored);
        set({ activeHomeId: matchesStored ? stored : list[0].id });
      }
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to load homes",
      });
    }
  },

  setActiveHomeId: (activeHomeId) => {
    set({ activeHomeId });
    if (typeof window !== "undefined") {
      localStorage.setItem("domus_active_home_id", activeHomeId);
    }
  },

  createHome: async (req) => {
    set({ isLoading: true, error: null });
    try {
      const newHome = await homeRepository.create(req);
      set((state) => ({
        homes: [...state.homes, newHome],
        activeHomeId: state.activeHomeId || newHome.id,
        isLoading: false,
      }));
      if (get().activeHomeId === newHome.id) {
        get().setActiveHomeId(newHome.id);
      }
      return newHome;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to create home",
      });
      throw err;
    }
  },

  updateHome: async (id, req) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await homeRepository.update(id, req);
      set((state) => ({
        homes: state.homes.map((h) => (h.id === id ? updated : h)),
        isLoading: false,
      }));
      hydrateTariffCache(updated.id, updated.billing_settings);
      return updated;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to update home",
      });
      throw err;
    }
  },

  deleteHome: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await homeRepository.delete(id);
      const remaining = get().homes.filter((h) => h.id !== id);

      let nextActiveId = get().activeHomeId;
      if (get().activeHomeId === id) {
        nextActiveId = remaining.length > 0 ? remaining[0].id : null;
      }

      set({
        homes: remaining,
        activeHomeId: nextActiveId,
        isLoading: false,
      });

      if (nextActiveId) {
        get().setActiveHomeId(nextActiveId);
      } else if (typeof window !== "undefined") {
        localStorage.removeItem("domus_active_home_id");
      }
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to delete home",
      });
      throw err;
    }
  },
}));
