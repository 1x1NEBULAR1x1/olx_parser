import { create } from "zustand";
import type { AppNotification } from "@/shared/types";

interface NotificationsLiveState {
  unread_count: number;
  cursor: number;
  pending_toasts: AppNotification[];
  applySnapshot: (count: number, cursor: number, items: AppNotification[]) => void;
  clearPendingToasts: () => void;
}

export const useNotificationsLiveStore = create<NotificationsLiveState>((set) => ({
  unread_count: 0,
  cursor: 0,
  pending_toasts: [],
  applySnapshot: (count, cursor, items) => set((state) => ({
    unread_count: count,
    cursor,
    pending_toasts: items.length > 0
      ? [...state.pending_toasts, ...items]
      : state.pending_toasts,
  })),
  clearPendingToasts: () => set({ pending_toasts: [] }),
}));
