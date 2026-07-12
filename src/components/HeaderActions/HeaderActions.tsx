import Link from "next/link";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { NotificationBell } from "@/components/NotificationBell/NotificationBell";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
import { PreferencesMenu } from "@/components/PreferencesMenu/PreferencesMenu";
import { UserMenu } from "@/components/UserMenu/UserMenu";
import styles from "./HeaderActions.module.scss";

export function HeaderActions() {
  const t_app = useTranslations("app");

  return (
    <div className={styles.actions}>
      <div className={styles.actions_desktop}>
        <NotificationBell />
        <Link
          href="/settings"
          className="app-btn-icon"
          aria-label={t_app("settings")}
          title={t_app("settings")}
        >
          <Settings size={18} aria-hidden />
        </Link>
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
