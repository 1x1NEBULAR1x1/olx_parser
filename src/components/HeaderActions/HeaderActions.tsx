import { NotificationBell } from "@/components/NotificationBell/NotificationBell";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
import { UserMenu } from "@/components/UserMenu/UserMenu";
import styles from "./HeaderActions.module.scss";

// Общий "правый блок" шапки — используется на ВСЕХ страницах вместо
// дублирования одного и того же набора иконок (уведомления/тема/язык) в
// каждом page.tsx. Каждая страница по-прежнему рисует свою собственную
// шапку/breadcrumb слева — этот компонент только про правую группу действий.
export function HeaderActions() {
  return (
    <div className={styles.actions}>
      <NotificationBell />
      <UserMenu />
      <ThemeSwitcher />
      <LanguageSwitcher />
    </div>
  );
}
