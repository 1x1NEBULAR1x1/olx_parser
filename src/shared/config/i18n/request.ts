import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import type { AbstractIntlMessages } from "next-intl";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isAppLocale, type AppLocale } from "@/shared/config/i18n/config";

export default getRequestConfig(async () => {
  const cookie_store = await cookies();
  const cookie_locale = cookie_store.get(LOCALE_COOKIE_NAME)?.value;
  const locale: AppLocale = isAppLocale(cookie_locale) ? cookie_locale : DEFAULT_LOCALE;

  const messages = (await import(`@/shared/config/i18n/locales/${locale}`)).default as AbstractIntlMessages;

  return { locale, messages };
});
