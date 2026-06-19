// API Notification Repository implementation
import type { INotificationRepository } from "../types";
import type { NotificationOut } from "@/types/api";
import { apiClient } from "@/services/api-client";

export class ApiNotificationRepository implements INotificationRepository {
  public async list(params: {
    home_id: string;
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NotificationOut[]> {
    return apiClient.get("/notifications", {
      params: {
        home_id: params.home_id,
        unread: params.unread,
        limit: params.limit,
        offset: params.offset,
      },
    });
  }

  public async markRead(id: string): Promise<NotificationOut> {
    return apiClient.post(`/notifications/${id}/read`);
  }
}
