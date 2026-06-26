// API Energy Repository implementation
import type { IEnergyRepository } from "../types";
import type { EnergySummary } from "@/types/api";
import { apiClient } from "@/services/api-client";

export class ApiEnergyRepository implements IEnergyRepository {
  public async summary(params: {
    home_id: string;
    hours?: number;
    minutes?: number;
  }): Promise<EnergySummary> {
    return apiClient.get("/energy/summary", {
      params: {
        home_id: params.home_id,
        hours: params.hours,
        minutes: params.minutes,
      },
    });
  }
}
