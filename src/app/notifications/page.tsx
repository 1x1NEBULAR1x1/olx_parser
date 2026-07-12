"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, MapPin, Settings, Smartphone } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { HeaderActions } from "@/components/HeaderActions/HeaderActions";
import {
  fetchNotifications,
  markNotificationsRead,
  clearAllNotifications,
} from "@/lib/api";
import type { AppNotification } from "@/lib/api";
import type { AppLocale } from "@/i18n/config";
import styles from "./page.module.scss";

const DATE_LOCALE_MAP: Record<AppLocale, string> = {
  pl: "pl-PL",
  en: "en-US",
  ru: "ru-RU",
};

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const [notifications, set_notifications] = useState<AppNotification[]>([]);
  const [loading, set_loading] = useState(true);
  const [clearing, set_clearing] = useState(false);

  useEffect(() => {
    fetchNotifications()
      .then((list) => {
        set_notifications(list);
        set_loading(false);
        // Отмечаем прочитанными сразу при открытии страницы — список
        // уведомлений сам по себе служит "историей", а не inbox с ручной
        // разметкой, поэтому счётчик на колокольчике должен сброситься.
        if (list.some((n) => !n.is_read)) {
          void markNotificationsRead();
        }
      })
      .catch(() => set_loading(false));
  }, []);

  async function handleClearAll() {
    set_clearing(true);
    try {
      await clearAllNotifications();
      set_notifications([]);
    } finally {
      set_clearing(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 flex-wrap">
          <Link href="/" className="text-sm font-bold app-text ">← SmartFlip</Link>
          <span className="app-divider hidden sm:inline">/</span>
          <span className="text-sm app-text-muted flex-1">{t("title")}</span>
          <Link
            href="/notifications/settings"
            className="app-btn-ghost whitespace-nowrap"
          >
            <Settings size={16} aria-hidden />
            {t("settings")}
          </Link>
          <HeaderActions />
        </div>
      </header>

      <div className="max-w-screen-md mx-auto px-3 sm:px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-black app-text">{t("title")}</h1>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className="text-sm app-text-muted hover:text-red-600 dark:hover:text-red-400 font-medium disabled:opacity-50"
            >
              {t("clear_all")}
            </button>
          )}
        </div>

        {loading ? (
          <div className="app-text-faint text-sm">{tc("loading")}</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-24 app-text-faint">
            <Bell size={48} className="mx-auto mb-4 opacity-60" aria-hidden />
            <p className="text-lg">{t("empty")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.map((n) => (
              <a
                key={n.id}
                href={n.olx_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.notification_card}
              >
                {n.photo_url ? (
                  <img src={n.photo_url} alt={n.title} className={styles.notification_photo} />
                ) : (
                  <div className={styles.notification_photo_placeholder}>
                    <Smartphone size={28} aria-hidden />
                  </div>
                )}
                <div className={styles.notification_body}>
                  <p className={styles.notification_title}>{n.title}</p>
                  <div className={styles.notification_meta}>
                    {n.price_buy !== null && (
                      <span className={styles.notification_price}>{n.price_buy} zł</span>
                    )}
                    {n.profitability_pct !== null && (
                      <span className={styles.notification_profitability}>
                        {n.profitability_pct}%
                      </span>
                    )}
                    {n.market_sell_price !== null && (
                      <span>~{n.market_sell_price} zł</span>
                    )}
                    {n.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} aria-hidden /> {n.city}
                      </span>
                    )}
                  </div>
                  <p className={styles.notification_date}>
                    {new Date(n.created_at).toLocaleString(DATE_LOCALE_MAP[locale], {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className={styles.notification_arrow}>{tc("open_link")} →</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
