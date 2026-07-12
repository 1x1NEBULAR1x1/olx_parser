"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./NotificationBell.module.scss";
import { fetchUnreadNotificationsCount } from "@/lib/api";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const t = useTranslations("notifications");
  const [unread_count, set_unread_count] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const count = await fetchUnreadNotificationsCount();
        if (!cancelled) set_unread_count(count);
      } catch {
        // Сервер временно недоступен — не критично, попробуем на следующем тике.
      }
    }

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Link href="/notifications" className={styles.bell} aria-label={t("title")} title={t("title")}>
      <Bell size={18} aria-hidden />
      {unread_count > 0 && (
        <span className={styles.bell_badge}>{unread_count > 99 ? "99+" : unread_count}</span>
      )}
    </Link>
  );
}
