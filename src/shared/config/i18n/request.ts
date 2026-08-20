import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import type { AbstractIntlMessages } from "next-intl";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isAppLocale, type AppLocale } from "@/shared/config/i18n/config";
import en from "@/shared/config/i18n/locales/en";
import pl from "@/shared/config/i18n/locales/pl";
import ru from "@/shared/config/i18n/locales/ru";

const MESSAGES_BY_LOCALE: Record<AppLocale, AbstractIntlMessages> = {
  en: en as AbstractIntlMessages,
  pl: pl as AbstractIntlMessages,
  ru: ru as AbstractIntlMessages,
};

export default getRequestConfig(async () => {
  const cookie_store = await cookies();
  const cookie_locale = cookie_store.get(LOCALE_COOKIE_NAME)?.value;
  const locale: AppLocale = isAppLocale(cookie_locale) ? cookie_locale : DEFAULT_LOCALE;

  return { locale, messages: MESSAGES_BY_LOCALE[locale] };
});
