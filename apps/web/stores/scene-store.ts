// Zustand Scene Store implementation
import { create } from "zustand";
import { sceneRepository } from "@/repositories";
import type {
  SceneOut,
  SceneCreate,
  SceneUpdate,
  SceneActivateResult,
} from "@/types/api";

interface SceneState {
  scenes: SceneOut[];
  isLoading: boolean;
  error: string | null;

  fetchScenes: (homeId: string) => Promise<void>;
  createScene: (req: SceneCreate) => Promise<SceneOut>;
  updateScene: (id: string, req: SceneUpdate) => Promise<SceneOut>;
  deleteScene: (id: string) => Promise<void>;
  activateScene: (id: string) => Promise<SceneActivateResult>;
}

export const useSceneStore = create<SceneState>((set) => ({
  scenes: [],
  isLoading: false,
  error: null,

  fetchScenes: async (homeId) => {
    set({ isLoading: true, error: null });
    try {
      const list = await sceneRepository.list(homeId);
      set({ scenes: list, isLoading: false });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to load scenes",
      });
    }
  },

  createScene: async (req) => {
    set({ isLoading: true, error: null });
    try {
      const res = await sceneRepository.create(req);
      set((prev) => ({
        scenes: [...prev.scenes, res],
        isLoading: false,
      }));
      return res;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to create scene",
      });
      throw err;
    }
  },

  updateScene: async (id, req) => {
    set({ isLoading: true, error: null });
    try {
      const res = await sceneRepository.update(id, req);
      set((prev) => ({
        scenes: prev.scenes.map((s) => (s.id === id ? res : s)),
        isLoading: false,
      }));
      return res;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to update scene",
      });
      throw err;
    }
  },

  deleteScene: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await sceneRepository.delete(id);
      set((prev) => ({
        scenes: prev.scenes.filter((s) => s.id !== id),
        isLoading: false,
      }));
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to delete scene",
      });
      throw err;
    }
  },

  activateScene: async (id) => {
    return sceneRepository.activate(id);
  },
}));
