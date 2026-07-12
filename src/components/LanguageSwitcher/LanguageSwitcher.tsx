"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import styles from "./LanguageSwitcher.module.scss";
import { SUPPORTED_LOCALES, LOCALE_COOKIE_NAME, type AppLocale } from "@/i18n/config";

const LOCALE_LABELS: Record<AppLocale, string> = {
  pl: "PL",
  en: "EN",
  ru: "RU",
};

export function LanguageSwitcher() {
  const router = useRouter();
  const active_locale = useLocale();

  function selectLocale(next_locale: AppLocale) {
    if (next_locale === active_locale) return;
    document.cookie = `${LOCALE_COOKIE_NAME}=${next_locale}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div className={styles.switcher} role="group" aria-label="Language switcher">
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
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
