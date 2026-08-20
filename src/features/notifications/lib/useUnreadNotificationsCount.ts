"use client";

import { useSession } from "next-auth/react";
import { useNotificationsLive } from "@/features/notifications/lib/use-notifications-live";
import { useNotificationsLiveStore } from "@/features/notifications/model/notifications-live-store";

export function useUnreadNotificationsCount(): number {
  const { status } = useSession();
  useNotificationsLive();
  const unread_count = useNotificationsLiveStore((state) => state.unread_count);
  return status === "authenticated" ? unread_count : 0;
}
