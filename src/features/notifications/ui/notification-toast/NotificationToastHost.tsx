"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { NotificationToast } from "./NotificationToast";
import styles from "./NotificationToast.module.scss";
import {
  registerServiceWorker,
  type ToastNotificationPayload,
} from "@/features/notifications/lib/push-client";
import { useNotificationsLive } from "@/features/notifications/lib/use-notifications-live";
import { useNotificationsLiveStore } from "@/features/notifications/model/notifications-live-store";

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 8_000;

function buildToastFromApi(row: {
  id: number;
  title: string;
  olx_url: string;
  photo_url: string | null;
  price_buy: number | null;
  profitability_pct: number | null;
}): ToastNotificationPayload {
  const meta = [
    row.price_buy !== null ? `${row.price_buy} zł` : null,
    row.profitability_pct !== null ? `${row.profitability_pct}%` : null,
  ].filter(Boolean).join(" · ");

  return {
    id: row.id,
    title: row.title,
    body: meta,
    url: "/notifications",
    photo_url: row.photo_url,
    olx_url: row.olx_url,
    price_buy: row.price_buy,
    profitability_pct: row.profitability_pct,
  };
}

export function NotificationToastHost() {
  const { status } = useSession();
  useNotificationsLive();
  const pending_toasts = useNotificationsLiveStore((state) => state.pending_toasts);
  const clearPendingToasts = useNotificationsLiveStore((state) => state.clearPendingToasts);
  const [toasts, set_toasts] = useState<ToastNotificationPayload[]>([]);
  const seen_ids_ref = useRef<Set<number>>(new Set());
  const timers_ref = useRef<Map<number, number>>(new Map());

  const enqueue = useCallback((payload: ToastNotificationPayload) => {
    if (seen_ids_ref.current.has(payload.id)) return;
    seen_ids_ref.current.add(payload.id);
    set_toasts((prev) => [payload, ...prev].slice(0, MAX_VISIBLE));

    const timer = window.setTimeout(() => {
      set_toasts((prev) => prev.filter((item) => item.id !== payload.id));
      timers_ref.current.delete(payload.id);
    }, AUTO_DISMISS_MS);
    timers_ref.current.set(payload.id, timer);
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers_ref.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers_ref.current.delete(id);
    }
    set_toasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Регистрация SW + сообщения от push (онлайн-ветка).
  useEffect(() => {
    if (status !== "authenticated") return;

    void registerServiceWorker();

    function onMessage(event: MessageEvent) {
      const data = event.data as {
        type?: string;
        payload?: {
          title?: string;
          body?: string;
          url?: string;
          notification_id?: number;
          olx_url?: string | null;
          photo_url?: string | null;
          price_buy?: number | null;
          profitability_pct?: number | null;
        };
      } | null;
      if (!data || data.type !== "SMARTFLIP_TOAST" || !data.payload) return;
      const id = data.payload.notification_id ?? Date.now();
      enqueue({
        id,
        title: data.payload.title ?? "SmartFlip",
        body: data.payload.body ?? "",
        url: data.payload.url ?? "/notifications",
        photo_url: data.payload.photo_url ?? null,
        olx_url: data.payload.olx_url ?? null,
        price_buy: data.payload.price_buy ?? null,
        profitability_pct: data.payload.profitability_pct ?? null,
      });
    }

    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [enqueue, status]);

  // Long-poll: новые in-app уведомления, пока вкладка видима.
  useEffect(() => {
    if (status !== "authenticated" || pending_toasts.length === 0) return;
    const fresh = pending_toasts.filter((row) => !row.is_read && !seen_ids_ref.current.has(row.id));
    clearPendingToasts();
    for (const row of fresh) {
      enqueue(buildToastFromApi(row));
    }
  }, [clearPendingToasts, enqueue, pending_toasts, status]);

  useEffect(() => () => {
    for (const timer of timers_ref.current.values()) window.clearTimeout(timer);
    timers_ref.current.clear();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.toast_host} aria-live="polite">
      {toasts.map((item) => (
        <NotificationToast key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  );
}
