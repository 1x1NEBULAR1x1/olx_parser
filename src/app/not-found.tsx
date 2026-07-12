"use client";

import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("errors");

  return (
    <main className="app-shell flex flex-col items-center justify-center p-8 app-text-muted">
      <h1 className="text-4xl font-black mb-3 app-text">{t("not_found_title")}</h1>
      <p className="text-lg mb-4">{t("not_found_text")}</p>
    </main>
  );
}
