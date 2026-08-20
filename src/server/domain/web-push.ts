import webpush from "web-push";
import { config } from "@/server/shared/config";
import {
  deletePushSubscriptionByEndpoint,
  listPushSubscriptionsForUser,
} from "@/server/repositories/push-subscriptions-repository";

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  notification_id: number;
  olx_url: string | null;
  photo_url: string | null;
  price_buy: number | null;
  profitability_pct: number | null;
}

let vapid_configured = false;

function ensureVapid(): boolean {
  const { public_key, private_key, subject } = config.web_push;
  if (!public_key || !private_key) return false;
  if (!vapid_configured) {
    webpush.setVapidDetails(subject, public_key, private_key);
    vapid_configured = true;
  }
  return true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(config.web_push.public_key && config.web_push.private_key);
}

export function getWebPushPublicKey(): string | null {
  return config.web_push.public_key;
}

/** Отправка Web Push на все подписки пользователя. Мёртвые endpoint'ы чистятся. */
export async function sendWebPushToUser(
  user_id: string,
  payload: WebPushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) return { sent: 0, failed: 0 };

  const subscriptions = await listPushSubscriptionsForUser(user_id);
  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 12, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const status_code =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode: number }).statusCode)
            : null;
        // 404/410 — подписка протухла, удаляем.
        if (status_code === 404 || status_code === 410) {
          await deletePushSubscriptionByEndpoint(sub.endpoint).catch(() => undefined);
        } else {
          console.error("[web-push] send failed:", error);
        }
      }
    }),
  );

  return { sent, failed };
}
