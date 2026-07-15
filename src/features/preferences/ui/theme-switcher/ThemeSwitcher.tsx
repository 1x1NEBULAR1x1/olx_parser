"use client";

import { useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import styles from "./ThemeSwitcher.module.scss";
import { applyTheme, readThemeChoice, THEME_STORAGE_KEY, type ThemeChoice } from "@/shared/lib/theme";

const THEME_ICONS: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const THEME_ORDER: ThemeChoice[] = ["light", "dark", "system"];

interface ThemeSwitcherProps {
  variant?: "inline" | "stacked";
}

export function ThemeSwitcher({ variant = "inline" }: ThemeSwitcherProps) {
  const t = useTranslations("theme");
  const [choice, set_choice] = useState<ThemeChoice>("system");
  const [mounted, set_mounted] = useState(false);

  useLayoutEffect(() => {
    const stored = readThemeChoice();
    set_choice(stored);
    applyTheme(stored);
    set_mounted(true);
  }, []);

  function selectTheme(next_choice: ThemeChoice) {
    set_choice(next_choice);
    localStorage.setItem(THEME_STORAGE_KEY, next_choice);
    applyTheme(next_choice);
  }

  return (
    <div
      className={[
        styles.switcher,
        variant === "stacked" ? styles.switcher_stacked : "",
        !mounted ? styles.switcher_pending : "",
      ].join(" ")}
      role="group"
      aria-label={t("label")}
    >
      {THEME_ORDER.map((theme_choice) => {
        const Icon = THEME_ICONS[theme_choice];
        return (
          <button
            key={theme_choice}
            type="button"
            className={[
              styles.switcher_btn,
              theme_choice === choice ? styles.switcher_btn_active : "",
            ].join(" ")}
            onClick={() => selectTheme(theme_choice)}
            aria-pressed={theme_choice === choice}
            title={t(theme_choice)}
          >
            <Icon size={16} aria-hidden />
            {variant === "stacked" && (
              <span className={styles.switcher_label}>{t(theme_choice)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
