"use client";

import { useTranslations } from "next-intl";
import styles from "./LoadingCenter.module.scss";

interface LoadingCenterProps {
  label?: string;
  compact?: boolean;
}

export function LoadingCenter({ label, compact = false }: LoadingCenterProps) {
  const t = useTranslations("common");
  const text = label ?? t("loading");

  return (
    <div
      className={`${styles.loading_center} ${compact ? styles.loading_center_compact : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={styles.loading_center_spinner} aria-hidden />
      <p className={styles.loading_center_label}>{text}</p>
    </div>
  );
}
