import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { buildAntiFoucScript } from "@/lib/theme";
import { MuiProvider } from "@/components/MuiProvider/MuiProvider";
import { AuthProvider } from "@/components/AuthProvider/AuthProvider";
import { ThemeInit } from "@/components/ThemeInit/ThemeInit";
import "./globals.scss";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
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
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeInit />
          <AuthProvider>
            <MuiProvider>{children}</MuiProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
