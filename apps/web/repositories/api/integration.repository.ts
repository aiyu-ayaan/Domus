// API Integration Repository implementation
import type { IIntegrationRepository } from "../types";
import type {
  IntegrationOut,
  IntegrationCreate,
  IntegrationUpdate,
  DiscoveryResult,
} from "@/types/api";
import { apiClient } from "@/services/api-client";

export class ApiIntegrationRepository implements IIntegrationRepository {
  public async listAvailable(): Promise<string[]> {
    return apiClient.get("/integrations/available");
  }

  public async list(homeId?: string): Promise<IntegrationOut[]> {
    return apiClient.get("/integrations", {
      params: homeId ? { home_id: homeId } : undefined,
    });
  }

  public async create(req: IntegrationCreate): Promise<IntegrationOut> {
    return apiClient.post("/integrations", req);
  }

  public async get(id: string): Promise<IntegrationOut> {
    return apiClient.get(`/integrations/${id}`);
  }

  public async update(
    id: string,
    req: IntegrationUpdate,
  ): Promise<IntegrationOut> {
    return apiClient.patch(`/integrations/${id}`, req);
  }

  public async delete(id: string): Promise<void> {
    return apiClient.delete(`/integrations/${id}`);
  }

  public async discover(id: string): Promise<DiscoveryResult> {
    return apiClient.post(`/integrations/${id}/discover`);
  }
}
