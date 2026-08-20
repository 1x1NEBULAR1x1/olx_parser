"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AppShell, ErrorState, PageContainer } from "@/shared/ui/page-layout";
import styles from "@/shared/ui/page-layout/ErrorState.module.scss";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const details = process.env.NODE_ENV === "development"
    ? (error.message || t("generic"))
    : t("generic");

  return (
    <AppShell>
      <PageContainer max_width="md">
        <ErrorState
          title={t("title")}
          message={details}
          onRetry={reset}
          action={(
            <Link href="/" className={styles.error_state_btn}>
              {t("go_home")}
            </Link>
          )}
        />
      </PageContainer>
    </AppShell>
  );
}
