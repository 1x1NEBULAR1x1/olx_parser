export const SUPPORTED_LOCALES = ["pl", "en", "ru"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "pl";
export const LOCALE_COOKIE_NAME = "locale";

export function isAppLocale(value: string | undefined): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
