"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./ErrorState.module.scss";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function ErrorState({
  title,
  message,
  onRetry,
  action,
  icon,
}: ErrorStateProps) {
  const t = useTranslations("errors");

  return (
    <div className={styles.error_state} role="alert">
      <div className={styles.error_state_icon} aria-hidden>
        {icon ?? <WifiOff size={28} />}
      </div>
      <h2 className={styles.error_state_title}>{title ?? t("title")}</h2>
      <p className={styles.error_state_message}>{message}</p>
      {(onRetry || action) && (
        <div className={styles.error_state_actions}>
          {onRetry && (
            <button
              type="button"
              className={`${styles.error_state_btn} ${styles.error_state_btn_primary}`}
              onClick={onRetry}
            >
              {t("retry")}
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
