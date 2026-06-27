// Mock Home Repository implementation
import type { IHomeRepository } from "../types";
import type { HomeOut, HomeCreate, HomeUpdate } from "@/types/api";
import { mockDb } from "@/mocks/mock-db";
import { DEFAULT_BILLING_SETTINGS } from "@/lib/energy";

export class MockHomeRepository implements IHomeRepository {
  private delay(ms: number = 100) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async list(): Promise<HomeOut[]> {
    await this.delay();
    return mockDb.get("homes");
  }

  public async get(id: string): Promise<HomeOut> {
    await this.delay();
    const homes = mockDb.get("homes");
    const home = homes.find((h) => h.id === id);
    if (!home) {
      throw {
        error: { code: "not_found", message: "Home not found", details: null },
      };
    }
    return home;
  }

  public async create(req: HomeCreate): Promise<HomeOut> {
    await this.delay(200);
    const homes = mockDb.get("homes");
    const newHome: HomeOut = {
      id: "home-" + Math.random().toString(36).substr(2, 9),
      name: req.name,
      description: req.description,
      timezone: req.timezone || "Europe/Berlin",
      owner_id: mockDb.get("user").id,
      created_at: new Date().toISOString(),
      billing_settings: DEFAULT_BILLING_SETTINGS,
    };
    mockDb.set("homes", [...homes, newHome]);
    return newHome;
  }

  public async update(id: string, req: HomeUpdate): Promise<HomeOut> {
    await this.delay(150);
    const homes = mockDb.get("homes");
    const homeIdx = homes.findIndex((h) => h.id === id);
    if (homeIdx === -1) {
      throw {
        error: { code: "not_found", message: "Home not found", details: null },
      };
    }
    const updatedHome: HomeOut = {
      ...homes[homeIdx],
      ...req,
    };
    const updatedHomes = [...homes];
    updatedHomes[homeIdx] = updatedHome;
    mockDb.set("homes", updatedHomes);
    return updatedHome;
  }

  public async delete(id: string): Promise<void> {
    await this.delay(150);
    const homes = mockDb.get("homes");
    const filtered = homes.filter((h) => h.id !== id);
    mockDb.set("homes", filtered);
  }
}
