// Mock Device Repository implementation
import type { IDeviceRepository } from "../types";
import type {
  DeviceOut,
  DeviceCreate,
  DeviceUpdate,
  DeviceStateOut,
  Page,
} from "@/types/api";
import { mockDb } from "@/mocks/mock-db";

export class MockDeviceRepository implements IDeviceRepository {
  private delay(ms: number = 150) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async list(params: {
    home_id: string;
    room_id?: string | null;
    device_type?: string;
    online?: boolean;
    limit?: number;
    offset?: number;
    sort?: string;
  }): Promise<Page<DeviceOut>> {
    await this.delay();
    let list = mockDb
      .get("devices")
      .filter((d) => d.home_id === params.home_id);

    if (params.room_id !== undefined) {
      list = list.filter((d) => d.room_id === params.room_id);
    }
    if (params.device_type) {
      list = list.filter((d) => d.device_type === params.device_type);
    }
    if (params.online !== undefined) {
      list = list.filter((d) => d.online === params.online);
    }

    // Sorting
    const sortField = params.sort || "name";
    const desc = sortField.startsWith("-");
    const field = desc ? sortField.substring(1) : sortField;

    list.sort((a: any, b: any) => {
      const valA = a[field];
      const valB = b[field];
      if (valA < valB) return desc ? 1 : -1;
      if (valA > valB) return desc ? -1 : 1;
      return 0;
    });

    const total = list.length;
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    const paginated = list.slice(offset, offset + limit);

    return {
      items: paginated,
      total,
      limit,
      offset,
    };
  }

  public async get(id: string): Promise<DeviceOut> {
    await this.delay();
    const devices = mockDb.get("devices");
    const device = devices.find((d) => d.id === id);
    if (!device) {
      throw {
        error: {
          code: "not_found",
          message: "Device not found",
          details: null,
        },
      };
    }
    return device;
  }

  public async create(req: DeviceCreate): Promise<DeviceOut> {
    await this.delay(200);
    const devices = mockDb.get("devices");

    // Check uniqueness of external_id in the home
    const dup = devices.find(
      (d) => d.home_id === req.home_id && d.external_id === req.external_id,
    );
    if (dup) {
      throw {
        error: {
          code: "conflict",
          message: "Device external_id conflict",
          details: null,
        },
      };
    }

    const newDevice: DeviceOut = {
      id: "dev-" + Math.random().toString(36).substr(2, 9),
      home_id: req.home_id,
      integration_id: req.integration_id,
      room_id: req.room_id || null,
      external_id: req.external_id,
      name: req.name,
      manufacturer: req.manufacturer || "Generic",
      model: req.model || "Smart Device",
      serial_number: req.serial_number || null,
      device_type: req.device_type,
      online: true,
      last_seen: new Date().toISOString(),
      meta: {},
      created_at: new Date().toISOString(),
    };

    mockDb.set("devices", [...devices, newDevice]);

    // Seed initial state
    const states = mockDb.get("deviceStates");
    const defaultState =
      req.device_type === "thermostat"
        ? "21.0"
        : req.device_type === "lock"
          ? "closed"
          : "off";
    const newState: DeviceStateOut = {
      id: "state-" + Math.random().toString(36).substr(2, 9),
      device_id: newDevice.id,
      state: defaultState,
      attributes:
        req.device_type === "light"
          ? { brightness: 100 }
          : req.device_type === "thermostat"
            ? { target_temperature: 21.0 }
            : {},
      created_at: new Date().toISOString(),
    };
    mockDb.set("deviceStates", { ...states, [newDevice.id]: newState });

    return newDevice;
  }

  public async update(id: string, req: DeviceUpdate): Promise<DeviceOut> {
    await this.delay(100);
    const devices = mockDb.get("devices");
    const idx = devices.findIndex((d) => d.id === id);
    if (idx === -1) {
      throw {
        error: {
          code: "not_found",
          message: "Device not found",
          details: null,
        },
      };
    }
    const updatedDevice = {
      ...devices[idx],
      ...req,
    } as DeviceOut;
    const updatedDevices = [...devices];
    updatedDevices[idx] = updatedDevice;
    mockDb.set("devices", updatedDevices);
    return updatedDevice;
  }

  public async delete(id: string): Promise<void> {
    await this.delay(150);
    const devices = mockDb.get("devices");
    mockDb.set(
      "devices",
      devices.filter((d) => d.id !== id),
    );

    // Cleanup state
    const states = { ...mockDb.get("deviceStates") };
    delete states[id];
    mockDb.set("deviceStates", states);
  }

  public async turnOn(id: string): Promise<DeviceStateOut> {
    return this.setDeviceState(id, "on");
  }

  public async turnOff(id: string): Promise<DeviceStateOut> {
    return this.setDeviceState(id, "off");
  }

  public async toggle(id: string): Promise<DeviceStateOut> {
    const state = await this.getState(id);
    const nextState = state.state === "on" ? "off" : "on";
    return this.setDeviceState(id, nextState);
  }

  public async getState(id: string): Promise<DeviceStateOut> {
    await this.delay(50);
    const states = mockDb.get("deviceStates");
    const state = states[id];
    if (!state) {
      // Seed a default one if not exists
      const device = await this.get(id);
      const defaultState =
        device.device_type === "thermostat"
          ? "21.0"
          : device.device_type === "lock"
            ? "closed"
            : "off";
      const seedState: DeviceStateOut = {
        id: "state-" + Math.random().toString(36).substr(2, 9),
        device_id: id,
        state: defaultState,
        attributes: {},
        created_at: new Date().toISOString(),
      };
      mockDb.set("deviceStates", { ...states, [id]: seedState });
      return seedState;
    }
    return state;
  }

  public async getHistory(
    id: string,
    limit?: number,
    offset?: number,
  ): Promise<DeviceStateOut[]> {
    await this.delay(100);
    const histories = mockDb.get("deviceHistory");
    const history = histories[id] || [];

    const lim = limit || 20;
    const off = offset || 0;
    return history.slice(off, off + lim);
  }

  private async setDeviceState(
    id: string,
    stateString: string,
  ): Promise<DeviceStateOut> {
    await this.delay(100);
    const devices = mockDb.get("devices");
    const deviceIdx = devices.findIndex((d) => d.id === id);
    if (deviceIdx === -1) {
      throw {
        error: {
          code: "not_found",
          message: "Device not found",
          details: null,
        },
      };
    }

    // Set device online and update last_seen
    const updatedDevices = [...devices];
    updatedDevices[deviceIdx] = {
      ...updatedDevices[deviceIdx],
      online: true,
      last_seen: new Date().toISOString(),
    };
    mockDb.set("devices", updatedDevices);

    // Update state
    const states = mockDb.get("deviceStates");
    const oldState = states[id];
    const newAttributes = { ...(oldState?.attributes || {}) };

    // Simulating power values for plugs
    if (updatedDevices[deviceIdx].device_type === "plug") {
      newAttributes.current_consumption =
        stateString === "on" ? +(10 + Math.random() * 90).toFixed(1) : 0;
      newAttributes.energy_today = +(
        (newAttributes.energy_today || 0.42) + (stateString === "on" ? 0.01 : 0)
      ).toFixed(3);
    }

    const newState: DeviceStateOut = {
      id: "state-" + Math.random().toString(36).substr(2, 9),
      device_id: id,
      state: stateString,
      attributes: newAttributes,
      created_at: new Date().toISOString(),
    };

    mockDb.set("deviceStates", { ...states, [id]: newState });

    // Add to history
    const histories = mockDb.get("deviceHistory");
    const history = histories[id] || [];
    mockDb.set("deviceHistory", {
      ...histories,
      [id]: [newState, ...history].slice(0, 100), // Cap history at 100 entries
    });

    // Dispatch state changed event for the WebSocket simulator
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("domus_mock_ws_broadcast", {
          detail: {
            type: "device.state_changed",
            home_id: updatedDevices[deviceIdx].home_id,
            data: {
              device_id: id,
              state: stateString,
              attributes: newAttributes,
            },
          },
        }),
      );
    }

    return newState;
  }
}
