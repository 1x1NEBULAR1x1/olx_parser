"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./NotificationBell.module.scss";
import { useUnreadNotificationsCount } from "@/features/notifications/lib/useUnreadNotificationsCount";

export function NotificationBell() {
  const t = useTranslations("notifications");
  const unread_count = useUnreadNotificationsCount();

  return (
    <Link href="/notifications" className={styles.bell} aria-label={t("title")} title={t("title")}>
      <Bell size={18} aria-hidden />
      {unread_count > 0 && (
        <span className={styles.bell_badge}>{unread_count > 99 ? "99+" : unread_count}</span>
      )}
    </Link>
  );
}
