// API Scene Repository implementation
import type { ISceneRepository } from "../types";
import type {
  SceneOut,
  SceneCreate,
  SceneUpdate,
  SceneActivateResult,
} from "@/types/api";
import { apiClient } from "@/services/api-client";

export class ApiSceneRepository implements ISceneRepository {
  public async list(homeId?: string): Promise<SceneOut[]> {
    return apiClient.get("/scenes", {
      params: homeId ? { home_id: homeId } : undefined,
    });
  }

  public async create(req: SceneCreate): Promise<SceneOut> {
    return apiClient.post("/scenes", req);
  }

  public async get(id: string): Promise<SceneOut> {
    return apiClient.get(`/scenes/${id}`);
  }

  public async update(id: string, req: SceneUpdate): Promise<SceneOut> {
    return apiClient.patch(`/scenes/${id}`, req);
  }

  public async delete(id: string): Promise<void> {
    return apiClient.delete(`/scenes/${id}`);
  }

  public async activate(id: string): Promise<SceneActivateResult> {
    return apiClient.post(`/scenes/${id}/activate`);
  }
}
