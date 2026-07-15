import Link from "next/link";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Box, IconButton } from "@mui/material";
import { NotificationBell } from "@/features/notifications/ui/notification-bell/NotificationBell";
import { ThemeSwitcher } from "@/features/preferences/ui/theme-switcher/ThemeSwitcher";
import { LanguageSwitcher } from "@/features/preferences/ui/language-switcher/LanguageSwitcher";
import { PreferencesMenu } from "@/features/preferences/ui/preferences-menu/PreferencesMenu";
import { UserMenu } from "@/features/auth/ui/user-menu/UserMenu";

export function HeaderActions() {
  const t_app = useTranslations("app");

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.75, sm: 1.25 } }}>
      <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 1 }}>
        <NotificationBell />
        <IconButton
          component={Link}
          href="/settings"
          size="small"
          aria-label={t_app("settings")}
          title={t_app("settings")}
        >
          <Settings size={18} aria-hidden />
        </IconButton>
        <ThemeSwitcher />
        <LanguageSwitcher />
      </Box>
      <UserMenu />
      <Box sx={{ display: { xs: "flex", md: "none" } }}>
        <PreferencesMenu />
      </Box>
    </Box>
  );
}
