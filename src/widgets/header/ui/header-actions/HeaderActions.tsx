"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { NotificationBell } from "@/features/notifications/ui/notification-bell/NotificationBell";
import { ThemeSwitcher } from "@/features/preferences/ui/theme-switcher/ThemeSwitcher";
import { LanguageSwitcher } from "@/features/preferences/ui/language-switcher/LanguageSwitcher";
import { PreferencesMenu } from "@/features/preferences/ui/preferences-menu/PreferencesMenu";
import { UserMenu } from "@/features/auth/ui/user-menu/UserMenu";
import styles from "./HeaderActions.module.scss";

export function HeaderActions() {
  const t_app = useTranslations("app");

  return (
    <div className={styles.actions}>
      <NotificationBell />
      <Link
        href="/settings"
        className={`${styles.icon_btn} ${styles.icon_btn_wide}`}
        aria-label={t_app("settings")}
        title={t_app("settings")}
      >
        <Settings size={18} aria-hidden />
      </Link>
      <div className={styles.actions_desktop}>
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>
      <UserMenu />
      <div className={styles.actions_mobile}>
        <PreferencesMenu />
      </div>
    </div>
  );
}
