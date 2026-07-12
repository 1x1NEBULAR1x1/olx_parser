import { NotificationBell } from "@/components/NotificationBell/NotificationBell";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
import { PreferencesMenu } from "@/components/PreferencesMenu/PreferencesMenu";
import { UserMenu } from "@/components/UserMenu/UserMenu";
import styles from "./HeaderActions.module.scss";

export function HeaderActions() {
  return (
    <div className={styles.actions}>
      <div className={styles.actions_desktop}>
        <NotificationBell />
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
