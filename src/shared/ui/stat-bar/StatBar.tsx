"use client";

import { TermHint } from "@/shared/ui/term-hint/TermHint";
import styles from "./StatBar.module.scss";

interface StatBarProps {
  label: string;
  hint?: string;
  // 0-100, уже нормализованное значение для позиции шкалы (градиент
  // чёрный→красный→жёлтый→зелёный фиксированный, value двигает оверлей).
  value: number | null;
  // Отдельная текстовая подпись (может отличаться от value, например "72%"
  // или "6.2/10" — value только двигает заполнение шкалы).
  display_value: string;
  compact?: boolean;
}

const CLAMP_MIN = 0;
const CLAMP_MAX = 100;

export function StatBar({ label, hint, value, display_value, compact = false }: StatBarProps) {
  const clamped = value === null ? null : Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, value));

  return (
    <div className={[styles.stat_bar, compact ? styles.stat_bar_compact : ""].join(" ")}>
      <div className={styles.stat_bar_top}>
        <span className={styles.stat_bar_label}>
          {hint ? <TermHint label={label} hint={hint} compact /> : label}
        </span>
        <span className={styles.stat_bar_value}>{display_value}</span>
      </div>
      <div className={styles.stat_bar_track}>
        <div className={styles.stat_bar_gradient} />
        {clamped !== null && (
          <div
            className={styles.stat_bar_overlay}
            style={{ left: `${clamped}%` }}
          />
        )}
        {clamped === null && <div className={styles.stat_bar_overlay} style={{ left: 0 }} />}
      </div>
    </div>
  );
}
