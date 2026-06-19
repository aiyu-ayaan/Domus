// API Device Repository implementation
import type { IDeviceRepository } from "../types";
import type {
  DeviceOut,
  DeviceCreate,
  DeviceUpdate,
  DeviceStateOut,
  Page,
} from "@/types/api";
import { apiClient } from "@/services/api-client";

export class ApiDeviceRepository implements IDeviceRepository {
  public async list(params: {
    home_id: string;
    room_id?: string | null;
    device_type?: string;
    online?: boolean;
    limit?: number;
    offset?: number;
    sort?: string;
  }): Promise<Page<DeviceOut>> {
    // Flatten params for apiClient
    const queryParams: Record<
      string,
      string | number | boolean | null | undefined
    > = {
      home_id: params.home_id,
      device_type: params.device_type,
      online: params.online,
      limit: params.limit,
      offset: params.offset,
      sort: params.sort,
    };

    if (params.room_id !== undefined) {
      queryParams.room_id = params.room_id;
    }

    return apiClient.get("/devices", { params: queryParams });
  }

  public async get(id: string): Promise<DeviceOut> {
    return apiClient.get(`/devices/${id}`);
  }

  public async create(req: DeviceCreate): Promise<DeviceOut> {
    return apiClient.post("/devices", req);
  }

  public async update(id: string, req: DeviceUpdate): Promise<DeviceOut> {
    return apiClient.patch(`/devices/${id}`, req);
  }

  public async delete(id: string): Promise<void> {
    return apiClient.delete(`/devices/${id}`);
  }

  public async turnOn(id: string): Promise<DeviceStateOut> {
    return apiClient.post(`/devices/${id}/turn-on`);
  }

  public async turnOff(id: string): Promise<DeviceStateOut> {
    return apiClient.post(`/devices/${id}/turn-off`);
  }

  public async toggle(id: string): Promise<DeviceStateOut> {
    return apiClient.post(`/devices/${id}/toggle`);
  }

  public async setAttributes(
    id: string,
    attributes: Record<string, any>,
  ): Promise<DeviceStateOut> {
    return apiClient.post(`/devices/${id}/attributes`, attributes);
  }

  public async getState(id: string, refresh?: boolean): Promise<DeviceStateOut> {
    return apiClient.get(`/devices/${id}/state`, {
      params: refresh !== undefined ? { refresh } : undefined,
    });
  }

  public async getHistory(
    id: string,
    limit?: number,
    offset?: number,
  ): Promise<DeviceStateOut[]> {
    return apiClient.get(`/devices/${id}/history`, {
      params: { limit, offset },
    });
  }
}
