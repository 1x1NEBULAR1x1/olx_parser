"use client";

import { useTranslations } from "next-intl";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const details = error.message || t("generic");
  const stack = process.env.NODE_ENV === "development" ? error.stack : undefined;

  return (
    <main className="app-shell flex flex-col items-center justify-center p-8 app-text-muted">
      <h1 className="text-4xl font-black mb-3 app-text">{t("title")}</h1>
      <p className="text-lg mb-4">{details}</p>
      {stack && (
        <pre className="w-full max-w-2xl p-4 rounded-xl overflow-x-auto text-sm bg-[var(--color-surface)] border border-[var(--color-border)]">
          <code>{stack}</code>
        </pre>
      )}
      <button
        onClick={reset}
        className="mt-4 app-btn-primary"
      >
        {t("retry")}
      </button>
    </main>
  );
}
