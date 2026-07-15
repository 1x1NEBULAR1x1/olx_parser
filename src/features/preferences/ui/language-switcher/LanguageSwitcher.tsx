"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import styles from "./LanguageSwitcher.module.scss";
import { SUPPORTED_LOCALES, LOCALE_COOKIE_NAME, type AppLocale } from "@/shared/config/i18n/config";

const LOCALE_LABELS: Record<AppLocale, string> = {
  pl: "PL",
  en: "EN",
  ru: "RU",
};

const LOCALE_NAMES: Record<AppLocale, string> = {
  pl: "Polski",
  en: "English",
  ru: "Русский",
};

interface LanguageSwitcherProps {
  variant?: "inline" | "stacked";
}

export function LanguageSwitcher({ variant = "inline" }: LanguageSwitcherProps) {
  const router = useRouter();
  const active_locale = useLocale();
  const t_app = useTranslations("app");

  function selectLocale(next_locale: AppLocale) {
    if (next_locale === active_locale) return;
    document.cookie = `${LOCALE_COOKIE_NAME}=${next_locale}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div
      className={[
        styles.switcher,
        variant === "stacked" ? styles.switcher_stacked : "",
      ].join(" ")}
      role="group"
      aria-label={t_app("language")}
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className={[
            styles.switcher_btn,
            locale === active_locale ? styles.switcher_btn_active : "",
          ].join(" ")}
          onClick={() => selectLocale(locale)}
          aria-pressed={locale === active_locale}
        >
          {variant === "stacked" ? LOCALE_NAMES[locale] : LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
