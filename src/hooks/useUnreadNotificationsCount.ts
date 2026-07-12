"use client";

import { useEffect, useState } from "react";
import { fetchUnreadNotificationsCount } from "@/lib/api";

const POLL_INTERVAL_MS = 30_000;

export function useUnreadNotificationsCount(): number {
  const [unread_count, set_unread_count] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const count = await fetchUnreadNotificationsCount();
        if (!cancelled) set_unread_count(count);
      } catch {
        // Сервер временно недоступен — повторим на следующем тике.
      }
    }

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return unread_count;
}
