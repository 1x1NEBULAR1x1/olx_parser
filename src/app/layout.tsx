import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { buildAntiFoucScript } from "@/shared/lib/theme";
import { MuiProvider } from "@/shared/providers/mui-provider/MuiProvider";
import { AuthProvider } from "@/shared/providers/auth-provider/AuthProvider";
import { ThemeInit } from "@/shared/providers/theme-init/ThemeInit";
import { NotificationDelivery } from "@/widgets/notification-delivery/ui/NotificationDelivery";
import { AppHeader } from "@/widgets/app-header";
import { HeaderActions } from "@/widgets/header/ui/header-actions/HeaderActions";
import "./globals.scss";

const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SmartFlip",
  description: "SmartFlip — анализ и оценка ликвидности устройств с OLX",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Синхронно ставит .dark на <html> ДО гидратации React — иначе при
            сохранённой тёмной теме пользователь на долю секунды увидел бы
            светлую вёрстку (FOUC), пока клиентский ThemeSwitcher не смонтируется. */}
        <script dangerouslySetInnerHTML={{ __html: buildAntiFoucScript() }} />
      </head>
      <body className={manrope.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeInit />
          <AuthProvider>
            <MuiProvider>
              <AppHeader actions={<HeaderActions />} />
              {children}
              <NotificationDelivery />
            </MuiProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
