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
  integrations: [],
  devices: [],
  deviceStates: {},
  deviceHistory: {},
  scenes: [],
  automations: [],
  notifications: [],
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
