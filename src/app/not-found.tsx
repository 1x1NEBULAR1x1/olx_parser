"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileQuestion } from "lucide-react";
import { AppShell, ErrorState, PageContainer } from "@/shared/ui/page-layout";
import styles from "@/shared/ui/page-layout/ErrorState.module.scss";

export default function NotFound() {
  const t = useTranslations("errors");

  return (
    <AppShell>
      <PageContainer max_width="md">
        <ErrorState
          icon={<FileQuestion size={28} />}
          title={t("not_found_title")}
          message={t("not_found_text")}
          action={(
            <Link href="/" className={`${styles.error_state_btn} ${styles.error_state_btn_primary}`}>
              {t("go_home")}
            </Link>
          )}
        />
      </PageContainer>
    </AppShell>
  );
}
