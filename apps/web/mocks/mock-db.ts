// Client-side local memory database for the Domus Mock Repositories
import type {
  UserPublic,
  HomeOut,
  RoomOut,
  DeviceOut,
  DeviceStateOut,
  IntegrationOut,
  SceneOut,
  AutomationOut,
  NotificationOut,
} from "@/types/api";

const STORAGE_KEY = "domus_mock_db";

interface MockDatabase {
  user: UserPublic;
  homes: HomeOut[];
  rooms: RoomOut[];
  devices: DeviceOut[];
  deviceStates: Record<string, DeviceStateOut>;
  deviceHistory: Record<string, DeviceStateOut[]>;
  integrations: IntegrationOut[];
  scenes: SceneOut[];
  automations: AutomationOut[];
  notifications: NotificationOut[];
}

const DEFAULT_DB: MockDatabase = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    full_name: "Ada Lovelace",
    avatar_url: null,
    role: "owner",
    is_active: true,
    is_verified: true,
    created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
  },
  homes: [
    {
      id: "home-1",
      name: "Main House",
      description: "Primary Residence",
      timezone: "Europe/Berlin",
      owner_id: "user-1",
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "home-2",
      name: "Summer House",
      description: "Vacation Cabin",
      timezone: "Europe/Lisbon",
      owner_id: "user-1",
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
  ],
  rooms: [
    {
      id: "room-1",
      home_id: "home-1",
      name: "Living Room",
      icon: "sofa",
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "room-2",
      home_id: "home-1",
      name: "Bedroom",
      icon: "bed",
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "room-3",
      home_id: "home-1",
      name: "Kitchen",
      icon: "refrigerator",
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "room-4",
      home_id: "home-1",
      name: "Office",
      icon: "laptop",
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "room-5",
      home_id: "home-1",
      name: "Garage",
      icon: "car",
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
  ],
  integrations: [
    {
      id: "int-1",
      home_id: "home-1",
      name: "Tapo Integration",
      type: "tapo",
      enabled: true,
      last_sync_at: new Date("2026-06-19T23:00:00Z").toISOString(),
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "int-2",
      home_id: "home-1",
      name: "Xiaomi Home",
      type: "xiaomi",
      enabled: true,
      last_sync_at: new Date("2026-06-19T23:00:00Z").toISOString(),
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "int-3",
      home_id: "home-1",
      name: "Tuya Smart",
      type: "tuya",
      enabled: true,
      last_sync_at: new Date("2026-06-19T22:30:00Z").toISOString(),
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "int-4",
      home_id: "home-1",
      name: "MQTT Broker",
      type: "mqtt",
      enabled: true,
      last_sync_at: null,
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
  ],
  devices: [
    {
      id: "dev-1",
      home_id: "home-1",
      integration_id: "int-1",
      room_id: "room-1",
      external_id: "tapo-p110-01",
      name: "Living Room Smart Plug",
      manufacturer: "TP-Link",
      model: "Tapo P110",
      serial_number: "TAPO-P110-8899",
      device_type: "plug",
      online: true,
      last_seen: new Date("2026-06-19T23:25:00Z").toISOString(),
      meta: {},
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "dev-2",
      home_id: "home-1",
      integration_id: "int-1",
      room_id: "room-2",
      external_id: "tapo-l900-01",
      name: "Bedroom LED Light Strip",
      manufacturer: "TP-Link",
      model: "Tapo L900-5",
      serial_number: "TAPO-L900-2211",
      device_type: "light",
      online: true,
      last_seen: new Date("2026-06-19T23:25:00Z").toISOString(),
      meta: {},
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "dev-3",
      home_id: "home-1",
      integration_id: "int-2",
      room_id: "room-3",
      external_id: "xiaomi-plug-01",
      name: "Kitchen Kettle Plug",
      manufacturer: "Xiaomi",
      model: "Smart Plug V2",
      serial_number: "XIAO-PLUG-1002",
      device_type: "plug",
      online: false,
      last_seen: new Date("2026-06-19T21:10:00Z").toISOString(),
      meta: {},
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "dev-4",
      home_id: "home-1",
      integration_id: "int-3",
      room_id: "room-4",
      external_id: "tuya-bulb-01",
      name: "Office Desk Bulb",
      manufacturer: "Tuya",
      model: "Smart Bulb RGB",
      serial_number: "TUYA-BULB-3490",
      device_type: "light",
      online: true,
      last_seen: new Date("2026-06-19T23:25:00Z").toISOString(),
      meta: {},
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "dev-5",
      home_id: "home-1",
      integration_id: "int-4",
      room_id: "room-1",
      external_id: "mqtt-motion-01",
      name: "Living Room Motion Sensor",
      manufacturer: "Zigbee",
      model: "Motion Detector V3",
      serial_number: "ZIG-MOT-5501",
      device_type: "sensor",
      online: true,
      last_seen: new Date("2026-06-19T23:28:10Z").toISOString(),
      meta: {},
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "dev-6",
      home_id: "home-1",
      integration_id: "int-4",
      room_id: "room-1",
      external_id: "matter-nest-01",
      name: "Living Room Climate",
      manufacturer: "Google",
      model: "Nest Thermostat E",
      serial_number: "NEST-THERM-8822",
      device_type: "thermostat",
      online: true,
      last_seen: new Date("2026-06-19T23:25:00Z").toISOString(),
      meta: {},
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "dev-7",
      home_id: "home-1",
      integration_id: "int-1",
      room_id: "room-5",
      external_id: "tapo-cam-01",
      name: "Garage Security Camera",
      manufacturer: "TP-Link",
      model: "Tapo C200",
      serial_number: "TAPO-CAM-6655",
      device_type: "camera",
      online: true,
      last_seen: new Date("2026-06-19T23:24:00Z").toISOString(),
      meta: {},
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "dev-8",
      home_id: "home-1",
      integration_id: "int-4",
      room_id: "room-5",
      external_id: "zigbee-lock-01",
      name: "Garage Door Lock",
      manufacturer: "Yale",
      model: "Assure Lock 2",
      serial_number: "YALE-LOCK-9021",
      device_type: "lock",
      online: true,
      last_seen: new Date("2026-06-19T23:20:00Z").toISOString(),
      meta: {},
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
  ],
  deviceStates: {
    "dev-1": {
      id: "state-1",
      device_id: "dev-1",
      state: "on",
      attributes: { current_consumption: 12.4, energy_today: 0.42 },
      created_at: new Date().toISOString(),
    },
    "dev-2": {
      id: "state-2",
      device_id: "dev-2",
      state: "on",
      attributes: { brightness: 80, color_temp: 3200, color: "#f59e0b" },
      created_at: new Date().toISOString(),
    },
    "dev-3": {
      id: "state-3",
      device_id: "dev-3",
      state: "off",
      attributes: { current_consumption: 0, energy_today: 0.12 },
      created_at: new Date().toISOString(),
    },
    "dev-4": {
      id: "state-4",
      device_id: "dev-4",
      state: "off",
      attributes: { brightness: 100, color: "#06b6d4" },
      created_at: new Date().toISOString(),
    },
    "dev-5": {
      id: "state-5",
      device_id: "dev-5",
      state: "off",
      attributes: { lux: 15, battery: 92 },
      created_at: new Date().toISOString(),
    },
    "dev-6": {
      id: "state-6",
      device_id: "dev-6",
      state: "21.5",
      attributes: { target_temperature: 22.0, humidity: 45, mode: "heat" },
      created_at: new Date().toISOString(),
    },
    "dev-7": {
      id: "state-7",
      device_id: "dev-7",
      state: "idle",
      attributes: { recording: false, motion_detection: true },
      created_at: new Date().toISOString(),
    },
    "dev-8": {
      id: "state-8",
      device_id: "dev-8",
      state: "closed",
      attributes: { locked: true, battery: 85 },
      created_at: new Date().toISOString(),
    },
  },
  deviceHistory: {
    "dev-1": [
      {
        id: "h1",
        device_id: "dev-1",
        state: "on",
        attributes: { current_consumption: 12.4, energy_today: 0.42 },
        created_at: new Date(Date.now() - 60000).toISOString(),
      },
      {
        id: "h2",
        device_id: "dev-1",
        state: "on",
        attributes: { current_consumption: 14.8, energy_today: 0.4 },
        created_at: new Date(Date.now() - 300000).toISOString(),
      },
      {
        id: "h3",
        device_id: "dev-1",
        state: "off",
        attributes: { current_consumption: 0, energy_today: 0.38 },
        created_at: new Date(Date.now() - 600000).toISOString(),
      },
    ],
    "dev-6": [
      {
        id: "th1",
        device_id: "dev-6",
        state: "21.5",
        attributes: { target_temperature: 22.0 },
        created_at: new Date(Date.now() - 60000).toISOString(),
      },
      {
        id: "th2",
        device_id: "dev-6",
        state: "21.3",
        attributes: { target_temperature: 22.0 },
        created_at: new Date(Date.now() - 600000).toISOString(),
      },
      {
        id: "th3",
        device_id: "dev-6",
        state: "21.1",
        attributes: { target_temperature: 21.0 },
        created_at: new Date(Date.now() - 1200000).toISOString(),
      },
    ],
  },
  scenes: [
    {
      id: "scene-1",
      home_id: "home-1",
      name: "Movie Night",
      description: "Dims the lights and powers the TV setup",
      states: [
        { device_id: "dev-1", state: "on", attributes: {} },
        {
          device_id: "dev-2",
          state: "on",
          attributes: { brightness: 15, color: "#2563eb" },
        },
        { device_id: "dev-4", state: "off", attributes: {} },
      ],
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "scene-2",
      home_id: "home-1",
      name: "Away Mode",
      description: "Shut down all devices when leaving the house",
      states: [
        { device_id: "dev-1", state: "off", attributes: {} },
        { device_id: "dev-2", state: "off", attributes: {} },
        { device_id: "dev-4", state: "off", attributes: {} },
        {
          device_id: "dev-6",
          state: "18.0",
          attributes: { target_temperature: 18.0, mode: "eco" },
        },
        { device_id: "dev-8", state: "closed", attributes: { locked: true } },
      ],
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "scene-3",
      home_id: "home-1",
      name: "Morning Routine",
      description: "Gradual light and thermostat start",
      states: [
        {
          device_id: "dev-2",
          state: "on",
          attributes: { brightness: 60, color: "#f59e0b" },
        },
        {
          device_id: "dev-6",
          state: "22.0",
          attributes: { target_temperature: 22.0, mode: "heat" },
        },
      ],
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
  ],
  automations: [
    {
      id: "auto-1",
      home_id: "home-1",
      name: "Hallway Motion Light",
      enabled: true,
      trigger: { type: "device_state", device_id: "dev-5", state: "on" },
      conditions: [{ field: "lux", op: "lt", value: 10 }],
      actions: [
        { type: "device.turn_on", device_id: "dev-2" },
        {
          type: "notification.send",
          title: "Motion Alert",
          body: "Hallway motion detected. Light turned on.",
        },
      ],
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
    {
      id: "auto-2",
      home_id: "home-1",
      name: "Night Mode Auto Lock",
      enabled: true,
      trigger: { type: "time", at: "23:00" },
      conditions: [],
      actions: [
        { type: "scene.activate", scene_id: "scene-2" },
        {
          type: "notification.send",
          title: "System Status",
          body: "Away/Night mode scene activated automatically.",
        },
      ],
      created_at: new Date("2026-06-19T12:00:00Z").toISOString(),
    },
  ],
  notifications: [
    {
      id: "notif-1",
      home_id: "home-1",
      type: "device_offline",
      title: "Kettle Plug Offline",
      body: "Kitchen Kettle Plug (Xiaomi) went offline. Check power connection.",
      read: false,
      meta: { device_id: "dev-3" },
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "notif-2",
      home_id: "home-1",
      type: "new_device_found",
      title: "New Device Discovered",
      body: "Tuya Smart integration discovered one new Bulb RGB.",
      read: false,
      meta: { integration_id: "int-3" },
      created_at: new Date(Date.now() - 10000000).toISOString(),
    },
  ],
};

class MockDbManager {
  private getRawDb(): MockDatabase {
    if (typeof window === "undefined") {
      return DEFAULT_DB;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DB));
      return DEFAULT_DB;
    }
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_DB;
    }
  }

  private saveRawDb(db: MockDatabase) {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }
  }

  public get<K extends keyof MockDatabase>(key: K): MockDatabase[K] {
    return this.getRawDb()[key];
  }

  public set<K extends keyof MockDatabase>(key: K, value: MockDatabase[K]) {
    const db = this.getRawDb();
    db[key] = value;
    this.saveRawDb(db);

    // Dispatch custom event to notify listeners (e.g. WebSocket mock event trigger)
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("domus_mock_db_update", { detail: { key, value } }),
      );
    }
  }

  public reset() {
    this.saveRawDb(DEFAULT_DB);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("domus_mock_db_update", { detail: { reset: true } }),
      );
    }
  }
}

export const mockDb = new MockDbManager();
export type { MockDatabase };
