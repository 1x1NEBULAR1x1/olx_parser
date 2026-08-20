"use client";

import styles from "./EmptyState.module.scss";

interface EmptyStateProps {
  icon: React.ReactNode;
  title?: string;
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className={styles.empty_state}>
      <div className={styles.empty_state_icon} aria-hidden>
        {icon}
      </div>
      {title && <h2 className={styles.empty_state_title}>{title}</h2>}
      <p className={styles.empty_state_message}>{message}</p>
      {action && <div className={styles.empty_state_action}>{action}</div>}
    </div>
  );
}
