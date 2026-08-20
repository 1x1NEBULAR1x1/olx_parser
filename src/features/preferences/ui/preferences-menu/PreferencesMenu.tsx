"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, Heart, Settings, Shield, SlidersHorizontal, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemeSwitcher } from "@/features/preferences/ui/theme-switcher/ThemeSwitcher";
import { LanguageSwitcher } from "@/features/preferences/ui/language-switcher/LanguageSwitcher";
import { useUnreadNotificationsCount } from "@/features/notifications/lib/useUnreadNotificationsCount";
import styles from "./PreferencesMenu.module.scss";

export function PreferencesMenu() {
  const t_app = useTranslations("app");
  const t_settings = useTranslations("settings");
  const t_notifications = useTranslations("notifications");
  const t_notification_settings = useTranslations("notification_settings");
  const t_theme = useTranslations("theme");
  const pathname = usePathname() ?? "";
  const { data: session } = useSession();
  const unread_count = useUnreadNotificationsCount();
  const [is_open, set_is_open] = useState(false);
  const root_ref = useRef<HTMLDivElement>(null);
  const is_admin = session?.user?.role === "admin";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!root_ref.current?.contains(event.target as Node)) {
        set_is_open(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function closeMenu() {
    set_is_open(false);
  }

  const nav_items = [
    {
      href: "/",
      label: t_app("nav_feed"),
      icon: Smartphone,
      match: pathname === "/" || pathname.startsWith("/devices/"),
    },
    {
      href: "/favorites",
      label: t_app("nav_favorites"),
      icon: Heart,
      match: pathname.startsWith("/favorites"),
    },
    ...(is_admin
      ? [{
        href: "/admin",
        label: t_app("nav_admin"),
        icon: Shield,
        match: pathname.startsWith("/admin"),
      }]
      : []),
  ];

  return (
    <div className={styles.menu} ref={root_ref} data-testid="mobile-preferences-menu">
      <button
        type="button"
        className={styles.menu_trigger}
        onClick={() => set_is_open((prev) => !prev)}
        aria-label={t_app("preferences_menu")}
        aria-expanded={is_open}
      >
        <Settings size={18} aria-hidden />
      </button>

      {is_open && (
        <div className={styles.menu_dropdown}>
          <div className={`${styles.menu_section} ${styles.menu_section_first}`}>
            <span className={styles.menu_section_label}>{t_app("nav_section")}</span>
            <div className={styles.menu_panel}>
              {nav_items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.menu_item} ${item.match ? styles.menu_item_active : ""}`}
                    onClick={closeMenu}
                  >
                    <Icon size={14} aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className={styles.menu_section}>
            <span className={styles.menu_section_label}>{t_app("program_section")}</span>
            <div className={styles.menu_panel}>
              <Link href="/settings" className={styles.menu_item} onClick={closeMenu}>
                <Settings size={14} aria-hidden />
                <span>{t_settings("title")}</span>
              </Link>
              <Link href="/notifications" className={styles.menu_item} onClick={closeMenu}>
                <Bell size={14} aria-hidden />
                <span>{t_notifications("title")}</span>
                {unread_count > 0 && (
                  <span className={styles.menu_item_badge}>
                    {unread_count > 99 ? "99+" : unread_count}
                  </span>
                )}
              </Link>
              <Link href="/notifications/settings" className={styles.menu_item} onClick={closeMenu}>
                <SlidersHorizontal size={14} aria-hidden />
                <span>{t_notification_settings("title")}</span>
              </Link>
            </div>
          </div>

          <div className={styles.menu_section}>
            <span className={styles.menu_section_label}>{t_theme("label")}</span>
            <ThemeSwitcher variant="stacked" />
          </div>

          <div className={styles.menu_section}>
            <span className={styles.menu_section_label}>{t_app("language")}</span>
            <LanguageSwitcher variant="stacked" />
          </div>
        </div>
      )}
    </div>
  );
}
