// Mock Room Repository implementation
import type { IRoomRepository } from "../types";
import type { RoomOut, RoomCreate, RoomUpdate } from "@/types/api";
import { mockDb } from "@/mocks/mock-db";

export class MockRoomRepository implements IRoomRepository {
  private delay(ms: number = 100) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async list(homeId?: string): Promise<RoomOut[]> {
    await this.delay();
    const rooms = mockDb.get("rooms");
    if (homeId) {
      return rooms.filter((r) => r.home_id === homeId);
    }
    return rooms;
  }

  public async create(req: RoomCreate): Promise<RoomOut> {
    await this.delay(150);
    const rooms = mockDb.get("rooms");
    const newRoom: RoomOut = {
      id: "room-" + Math.random().toString(36).substr(2, 9),
      home_id: req.home_id,
      name: req.name,
      icon: req.icon || "sofa",
      created_at: new Date().toISOString(),
    };
    mockDb.set("rooms", [...rooms, newRoom]);
    return newRoom;
  }

  public async update(id: string, req: RoomUpdate): Promise<RoomOut> {
    await this.delay(100);
    const rooms = mockDb.get("rooms");
    const index = rooms.findIndex((r) => r.id === id);
    if (index === -1) {
      throw {
        error: { code: "not_found", message: "Room not found", details: null },
      };
    }
    const updatedRoom = {
      ...rooms[index],
      ...req,
    };
    const updatedRooms = [...rooms];
    updatedRooms[index] = updatedRoom;
    mockDb.set("rooms", updatedRooms);
    return updatedRoom;
  }

  public async delete(id: string): Promise<void> {
    await this.delay(150);
    const rooms = mockDb.get("rooms");
    const filtered = rooms.filter((r) => r.id !== id);
    mockDb.set("rooms", filtered);

    // Also orphan devices in this room
    const devices = mockDb.get("devices");
    const updatedDevices = devices.map((d) =>
      d.room_id === id ? { ...d, room_id: null } : d,
    );
    mockDb.set("devices", updatedDevices);
  }
}
