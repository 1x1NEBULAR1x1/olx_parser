"use client";

import { Tooltip } from "@mui/material";
import { CircleHelp } from "lucide-react";
import styles from "./TermHint.module.scss";

interface TermHintProps {
  label: string;
  hint: string;
  compact?: boolean;
}

export function TermHint({ label, hint, compact = false }: TermHintProps) {
  return (
    <Tooltip title={hint} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <button
        type="button"
        className={`${styles.term} ${compact ? styles.term_compact : ""}`}
        aria-label={`${label}: ${hint}`}
      >
        <span>{label}</span>
        <CircleHelp size={compact ? 10 : 12} className={styles.term_icon} aria-hidden />
      </button>
    </Tooltip>
  );
}
