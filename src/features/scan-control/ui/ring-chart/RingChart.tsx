"use client";

import styles from "./RingChart.module.scss";

interface RingChartProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track_color?: string;
  center_label: string;
  center_sublabel?: string;
  aria_label: string;
  is_busy?: boolean;
}

export function RingChart({
  value,
  size = 96,
  stroke = 7,
  color = "var(--color-primary)",
  track_color = "var(--color-border)",
  center_label,
  center_sublabel,
  aria_label,
  is_busy = false,
}: RingChartProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;
  const busy_arc = Math.max(18, circumference * 0.16);

  return (
    <div
      className={`${styles.ring} ${is_busy ? styles.ring_busy : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={aria_label}
      aria-busy={is_busy || undefined}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={track_color}
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          className={styles.ring_progress}
        />
        {is_busy && (
          <g className={styles.ring_busy_spin} style={{ transformOrigin: `${center}px ${center}px` }}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${busy_arc} ${circumference}`}
              transform={`rotate(-90 ${center} ${center})`}
              className={styles.ring_busy_arc}
            />
          </g>
        )}
      </svg>
      <div className={styles.ring_center}>
        <span className={styles.ring_label}>{center_label}</span>
        {center_sublabel && (
          <span className={styles.ring_sublabel}>{center_sublabel}</span>
        )}
      </div>
    </div>
  );
}
