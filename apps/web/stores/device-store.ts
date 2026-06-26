// Zustand Device Store implementation
import { create } from "zustand";
import { deviceRepository } from "@/repositories";
import type { DeviceOut, DeviceStateOut, DeviceCreate, DeviceUpdate } from "@/types/api";

interface DeviceState {
  devices: DeviceOut[];
  total: number;
  limit: number;
  offset: number;
  deviceStates: Record<string, DeviceStateOut>; // Map of deviceId -> state
  isLoading: boolean;
  error: string | null;

  // Filters
  search: string;
  selectedRoomId: string | null; // null means 'all'
  selectedType: string | null;
  selectedStatus: "all" | "online" | "offline";

  // Setters for filters
  setSearch: (search: string) => void;
  setSelectedRoomId: (roomId: string | null) => void;
  setSelectedType: (type: string | null) => void;
  setSelectedStatus: (status: "all" | "online" | "offline") => void;

  // Async operations
  fetchDevices: (homeId: string) => Promise<void>;
  fetchDeviceState: (
    deviceId: string,
    refresh?: boolean,
  ) => Promise<DeviceStateOut>;
  turnOnDevice: (deviceId: string) => Promise<void>;
  turnOffDevice: (deviceId: string) => Promise<void>;
  toggleDevice: (deviceId: string) => Promise<void>;
  setDeviceAttributes: (
    deviceId: string,
    attributes: Record<string, any>,
  ) => Promise<void>;
  createDevice: (req: DeviceCreate) => Promise<DeviceOut>;
  updateDevice: (deviceId: string, req: DeviceUpdate) => Promise<DeviceOut>;
  deleteDevice: (deviceId: string) => Promise<void>;

  // Realtime events callbacks
  updateDeviceInStore: (deviceId: string, updates: Partial<DeviceOut>) => void;
  updateDeviceStateInStore: (
    deviceId: string,
    newState: DeviceStateOut,
  ) => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  total: 0,
  limit: 50,
  offset: 0,
  deviceStates: {},
  isLoading: false,
  error: null,

  // Filters
  search: "",
  selectedRoomId: null,
  selectedType: null,
  selectedStatus: "all",

  setSearch: (search) => set({ search }),
  setSelectedRoomId: (selectedRoomId) => set({ selectedRoomId }),
  setSelectedType: (selectedType) => set({ selectedType }),
  setSelectedStatus: (selectedStatus) => set({ selectedStatus }),

  fetchDevices: async (homeId) => {
    set({ isLoading: true, error: null });
    try {
      const onlineParam =
        get().selectedStatus === "online"
          ? true
          : get().selectedStatus === "offline"
            ? false
            : undefined;

      const res = await deviceRepository.list({
        home_id: homeId,
        room_id: get().selectedRoomId || undefined,
        device_type: get().selectedType || undefined,
        online: onlineParam,
        limit: get().limit,
        offset: get().offset,
        sort: "name",
      });

      set({
        devices: res.items,
        total: res.total,
        isLoading: false,
      });

      // Fetch state for all online devices in parallel
      res.items.forEach((device) => {
        if (device.online) {
          get()
            .fetchDeviceState(device.id, true)
            .catch(() => {});
        }
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to load devices",
      });
    }
  },

  fetchDeviceState: async (deviceId, refresh) => {
    try {
      const state = await deviceRepository.getState(deviceId, refresh);
      set((prev) => ({
        deviceStates: {
          ...prev.deviceStates,
          [deviceId]: state,
        },
      }));
      if (refresh) {
        const device = await deviceRepository.get(deviceId);
        set((prev) => ({
          devices: prev.devices.map((d) => (d.id === deviceId ? device : d)),
        }));
      }
      return state;
    } catch (err) {
      if (refresh) {
        try {
          const device = await deviceRepository.get(deviceId);
          set((prev) => ({
            devices: prev.devices.map((d) => (d.id === deviceId ? device : d)),
          }));
        } catch {}
      }
      throw err;
    }
  },

  turnOnDevice: async (deviceId) => {
    const originalState = get().deviceStates[deviceId];
    const originalDevices = get().devices;

    // Optimistic UI update
    set((prev) => ({
      deviceStates: {
        ...prev.deviceStates,
        [deviceId]: {
          id: "temp-" + Date.now(),
          device_id: deviceId,
          state: "on",
          attributes: oldAttributes(originalState, "on"),
          created_at: new Date().toISOString(),
        },
      },
      devices: prev.devices.map((d) =>
        d.id === deviceId ? { ...d, online: true } : d,
      ),
    }));

    try {
      const finalState = await deviceRepository.turnOn(deviceId);
      get().updateDeviceStateInStore(deviceId, finalState);
      get().updateDeviceInStore(deviceId, { online: true });
    } catch (err) {
      // Revert state on error
      set({ devices: originalDevices });
      if (originalState) {
        get().updateDeviceStateInStore(deviceId, originalState);
      }
      throw err;
    }
  },

  turnOffDevice: async (deviceId) => {
    const originalState = get().deviceStates[deviceId];
    const originalDevices = get().devices;

    // Optimistic UI update
    set((prev) => ({
      deviceStates: {
        ...prev.deviceStates,
        [deviceId]: {
          id: "temp-" + Date.now(),
          device_id: deviceId,
          state: "off",
          attributes: oldAttributes(originalState, "off"),
          created_at: new Date().toISOString(),
        },
      },
    }));

    try {
      const finalState = await deviceRepository.turnOff(deviceId);
      get().updateDeviceStateInStore(deviceId, finalState);
      get().updateDeviceInStore(deviceId, { online: true });
    } catch (err) {
      set({ devices: originalDevices });
      if (originalState) {
        get().updateDeviceStateInStore(deviceId, originalState);
      }
      throw err;
    }
  },

  toggleDevice: async (deviceId) => {
    const currentState = get().deviceStates[deviceId];
    const nextStateStr = currentState?.state === "on" ? "off" : "on";
    const originalDevices = get().devices;

    // Optimistic UI update
    set((prev) => ({
      deviceStates: {
        ...prev.deviceStates,
        [deviceId]: {
          id: "temp-" + Date.now(),
          device_id: deviceId,
          state: nextStateStr,
          attributes: oldAttributes(currentState, nextStateStr),
          created_at: new Date().toISOString(),
        },
      },
    }));

    try {
      const finalState = await deviceRepository.toggle(deviceId);
      get().updateDeviceStateInStore(deviceId, finalState);
      get().updateDeviceInStore(deviceId, { online: true });
    } catch (err) {
      set({ devices: originalDevices });
      if (currentState) {
        get().updateDeviceStateInStore(deviceId, currentState);
      }
      throw err;
    }
  },

  setDeviceAttributes: async (deviceId, attributes) => {
    const originalState = get().deviceStates[deviceId];
    const originalAttributes = originalState?.attributes || {};
    const originalDevices = get().devices;

    set((prev) => ({
      deviceStates: {
        ...prev.deviceStates,
        [deviceId]: {
          ...prev.deviceStates[deviceId],
          attributes: {
            ...originalAttributes,
            ...attributes,
          },
        },
      },
    }));

    try {
      const finalState = await deviceRepository.setAttributes(
        deviceId,
        attributes,
      );

      // Preserve virtual UI attributes so they are not wiped out
      const virtualKeys = [
        "ambient_sync",
        "music_theme",
        "light_scene",
        "light_scene_gap",
        "custom_scene_colors",
      ];
      const preservedAttributes = { ...finalState.attributes };
      virtualKeys.forEach((key) => {
        if (key in attributes) {
          preservedAttributes[key] = attributes[key];
        } else if (key in originalAttributes) {
          preservedAttributes[key] = originalAttributes[key];
        }
      });
      finalState.attributes = preservedAttributes;

      get().updateDeviceStateInStore(deviceId, finalState);
      get().updateDeviceInStore(deviceId, { online: true });
    } catch (err) {
      set({ devices: originalDevices });
      if (originalState) {
        get().updateDeviceStateInStore(deviceId, originalState);
      }
      throw err;
    }
  },

  createDevice: async (req) => {
    set({ isLoading: true, error: null });
    try {
      const newDevice = await deviceRepository.create(req);
      set((prev) => ({
        devices: [...prev.devices, newDevice],
        isLoading: false,
      }));

      // Seed its state
      await get().fetchDeviceState(newDevice.id);
      return newDevice;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to create device",
      });
      throw err;
    }
  },

  updateDevice: async (deviceId, req) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await deviceRepository.update(deviceId, req);
      set((state) => ({
        devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        isLoading: false,
      }));
      return updated;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to update device",
      });
      throw err;
    }
  },

  deleteDevice: async (deviceId) => {
    set({ isLoading: true, error: null });
    try {
      await deviceRepository.delete(deviceId);
      set((prev) => {
        const nextStates = { ...prev.deviceStates };
        delete nextStates[deviceId];
        return {
          devices: prev.devices.filter((d) => d.id !== deviceId),
          deviceStates: nextStates,
          isLoading: false,
        };
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.error?.message || err?.message || "Failed to delete device",
      });
      throw err;
    }
  },

  updateDeviceInStore: (deviceId, updates) => {
    set((prev) => ({
      devices: prev.devices.map((d) =>
        d.id === deviceId ? { ...d, ...updates } : d,
      ),
    }));
  },

  updateDeviceStateInStore: (deviceId, newState) => {
    set((prev) => {
      const originalState = prev.deviceStates[deviceId];
      const originalAttributes = originalState?.attributes || {};
      const virtualKeys = [
        "ambient_sync",
        "music_theme",
        "light_scene",
        "light_scene_gap",
        "custom_scene_colors",
      ];

      const preservedAttributes = { ...newState.attributes };
      virtualKeys.forEach((key) => {
        if (key in originalAttributes && !(key in newState.attributes)) {
          preservedAttributes[key] = originalAttributes[key];
        }
      });

      const updatedState = {
        ...newState,
        attributes: preservedAttributes,
      };

      return {
        deviceStates: {
          ...prev.deviceStates,
          [deviceId]: updatedState,
        },
      };
    });
  },
}));

function oldAttributes(
  state: DeviceStateOut | undefined,
  nextState: string,
): Record<string, any> {
  const attrs = { ...(state?.attributes || {}) };
  // Optimistic power for a metered plug: carry the last known draw when turning
  // on (the real reading replaces it on the next state), zero when off.
  if ("current_consumption" in attrs || "power_w" in attrs) {
    const prior = attrs.power_w ?? attrs.current_consumption ?? 0;
    const w = nextState === "on" ? prior : 0;
    attrs.current_consumption = w;
    attrs.power_w = w;
  }
  return attrs;
}
