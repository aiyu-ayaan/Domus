// Zustand Notification Store implementation
import { create } from "zustand";
import { notificationRepository } from "@/repositories";
import type { NotificationOut } from "@/types/api";

interface NotificationState {
  notifications: NotificationOut[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  fetchNotifications: (homeId: string) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (homeId: string) => Promise<void>;
  addNotificationInStore: (notification: NotificationOut) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,

  fetchNotifications: async (homeId) => {
    set({ isLoading: true, error: null });
    try {
      const list = await notificationRepository.list({ home_id: homeId });
      const unread = list.filter((n) => !n.read).length;
      set({
        notifications: list,
        unreadCount: unread,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error:
          err?.error?.message || err?.message || "Failed to load notifications",
      });
    }
  },

  markAsRead: async (id) => {
    try {
      await notificationRepository.markRead(id);
      set((prev) => {
        const updated = prev.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        );
        return {
          notifications: updated,
          unreadCount: Math.max(0, prev.unreadCount - 1),
        };
      });
    } catch (err) {
      throw err;
    }
  },

  markAllAsRead: async (homeId) => {
    const unreadList = get().notifications.filter((n) => !n.read);
    try {
      await Promise.all(
        unreadList.map((n) => notificationRepository.markRead(n.id)),
      );
      set((prev) => ({
        notifications: prev.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (err) {
      throw err;
    }
  },

  addNotificationInStore: (notification) => {
    set((prev) => {
      // Avoid duplicate additions
      if (prev.notifications.some((n) => n.id === notification.id)) {
        return prev;
      }
      return {
        notifications: [notification, ...prev.notifications],
        unreadCount: prev.unreadCount + (notification.read ? 0 : 1),
      };
    });
  },
}));
