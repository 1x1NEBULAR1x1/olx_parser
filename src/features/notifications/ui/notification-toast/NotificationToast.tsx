"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./NotificationToast.module.scss";
import type { ToastNotificationPayload } from "@/features/notifications/lib/push-client";

interface NotificationToastProps {
  item: ToastNotificationPayload;
  onDismiss: (id: number) => void;
}

const SWIPE_DISMISS_PX = 64;

export function NotificationToast({ item, onDismiss }: NotificationToastProps) {
  const t = useTranslations("notifications");
  const [dismissing, set_dismissing] = useState(false);
  const [drag_y, set_drag_y] = useState(0);
  const start_y_ref = useRef<number | null>(null);
  const dragging_ref = useRef(false);

  function dismiss() {
    if (dismissing) return;
    set_dismissing(true);
    window.setTimeout(() => onDismiss(item.id), 220);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button,a")) return;
    start_y_ref.current = event.clientY;
    dragging_ref.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging_ref.current || start_y_ref.current === null) return;
    const delta = event.clientY - start_y_ref.current;
    // Смахивание вверх (как в соцсетях).
    set_drag_y(Math.min(0, delta));
  }

  function handlePointerUp() {
    if (!dragging_ref.current) return;
    dragging_ref.current = false;
    start_y_ref.current = null;
    if (drag_y <= -SWIPE_DISMISS_PX) {
      dismiss();
      return;
    }
    set_drag_y(0);
  }

  const meta_parts = [
    item.price_buy !== null ? `${item.price_buy} zł` : null,
    item.profitability_pct !== null ? `${item.profitability_pct}%` : null,
  ].filter(Boolean);

  return (
    <div
      className={`${styles.toast}${dismissing ? ` ${styles.toast_dismissing}` : ""}`}
      style={drag_y !== 0 ? { transform: `translateY(${drag_y}px)`, opacity: Math.max(0.35, 1 + drag_y / 120) } : undefined}
      role="status"
      aria-live="polite"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {item.photo_url ? (
        <img src={item.photo_url} alt="" className={styles.toast_photo} />
      ) : (
        <div className={styles.toast_photo_fallback} aria-hidden>
          <Bell size={18} />
        </div>
      )}

      <Link href={item.url} className={styles.toast_body} onClick={() => dismiss()}>
        <p className={styles.toast_title}>{item.title}</p>
        {(item.body || meta_parts.length > 0) && (
          <p className={styles.toast_meta}>
            {item.body || meta_parts.join(" · ")}
          </p>
        )}
      </Link>

      <button
        type="button"
        className={styles.toast_close}
        aria-label={t("toast_dismiss")}
        onClick={dismiss}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
