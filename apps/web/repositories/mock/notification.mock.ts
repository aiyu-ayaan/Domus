// Mock Notification Repository implementation
import type { INotificationRepository } from "../types";
import type { NotificationOut } from "@/types/api";
import { mockDb } from "@/mocks/mock-db";

export class MockNotificationRepository implements INotificationRepository {
  private delay(ms: number = 80) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async list(params: {
    home_id: string;
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NotificationOut[]> {
    await this.delay();
    let list = mockDb
      .get("notifications")
      .filter((n) => n.home_id === params.home_id);

    if (params.unread !== undefined) {
      list = list.filter((n) => n.read !== params.unread);
    }

    const limit = params.limit || 50;
    const offset = params.offset || 0;
    return list.slice(offset, offset + limit);
  }

  public async markRead(id: string): Promise<NotificationOut> {
    await this.delay(50);
    const notifications = mockDb.get("notifications");
    const idx = notifications.findIndex((n) => n.id === id);
    if (idx === -1) {
      throw {
        error: {
          code: "not_found",
          message: "Notification not found",
          details: null,
        },
      };
    }
    const updated = {
      ...notifications[idx],
      read: true,
    };
    const updatedList = [...notifications];
    updatedList[idx] = updated;
    mockDb.set("notifications", updatedList);
    return updated;
  }
}
