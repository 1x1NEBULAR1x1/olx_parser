import { config } from "@/server/shared/config";
import {
  listEnabledNotificationSettings,
  filterUnnotifiedListingIds,
  markListingsNotified,
  createNotification,
  type NotificationSettingsData,
  type NotificationRecord,
  type TelegramDeliveryStatus,
} from "@/server/repositories/user-notifications-repository";
import { sendWebPushToUser } from "@/server/domain/web-push";
import type { AnalyzedDevice } from "@/shared/types/domain";
import { listApprovedUserIds } from "@/server/repositories/user-listings-repository";
import { buildScanHealthTitle, type ScanOutcomeStatus } from "@/server/scan/scan-outcome";

export function matchesNotificationSettings(
  device: AnalyzedDevice,
  settings: NotificationSettingsData,
): boolean {
  if (settings.brands.length > 0 && !settings.brands.includes(device.brand)) return false;
  if (settings.model_keys.length > 0 && !settings.model_keys.includes(device.model_key)) return false;
  if (settings.regions.length > 0 && (!device.region || !settings.regions.includes(device.region))) return false;

  if (settings.min_profitability_pct !== null) {
    if (device.profitability_pct === null || device.profitability_pct < settings.min_profitability_pct) return false;
  }
  if (settings.max_profitability_pct !== null) {
    if (device.profitability_pct === null || device.profitability_pct > settings.max_profitability_pct) return false;
  }
  if (settings.min_price !== null) {
    if (device.price_buy === null || device.price_buy < settings.min_price) return false;
  }
  if (settings.max_price !== null) {
    if (device.price_buy === null || device.price_buy > settings.max_price) return false;
  }

  return true;
}

function buildTelegramText(device: AnalyzedDevice): string {
  const lines = [
    `📱 ${device.title}`,
    device.price_buy !== null ? `💰 Cena: ${device.price_buy} zł` : null,
    device.profitability_pct !== null ? `📈 Rentowność: ${device.profitability_pct}%` : null,
    device.market_sell_price !== null ? `🏷 Szac. cena sprzedaży: ${device.market_sell_price} zł` : null,
    device.city ? `📍 ${device.city}${device.region ? `, ${device.region}` : ""}` : null,
    device.olx_url,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

function buildPushBody(price_buy: number | null, profitability_pct: number | null): string {
  return [
    price_buy !== null ? `${price_buy} zł` : null,
    profitability_pct !== null ? `${profitability_pct}%` : null,
  ].filter(Boolean).join(" · ");
}

async function deliverWebPush(notification: NotificationRecord): Promise<void> {
  await sendWebPushToUser(notification.user_id, {
    title: notification.title,
    body: buildPushBody(notification.price_buy, notification.profitability_pct),
    url: "/notifications",
    notification_id: notification.id,
    olx_url: notification.olx_url,
    photo_url: notification.photo_url,
    price_buy: notification.price_buy,
    profitability_pct: notification.profitability_pct,
  });
}

export interface TelegramSendResult {
  status: TelegramDeliveryStatus;
  error: string | null;
}

/** Отправка в общий Telegram-чат (env). Без per-user chat_id — известное ограничение. */
export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const { bot_token, chat_id } = config.telegram;
  if (!bot_token || !chat_id) {
    return { status: "not_configured", error: null };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text,
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const body_text = await response.text().catch(() => "");
      return {
        status: "failed",
        error: `HTTP ${response.status}${body_text ? `: ${body_text.slice(0, 200)}` : ""}`,
      };
    }
    return { status: "sent", error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[notifier] Не удалось отправить сообщение в Telegram:", error);
    return { status: "failed", error: message };
  }
}

/**
 * Вызывается после сохранения устройств КАЖДОГО скана (scan-manager.ts).
 * Для каждого пользователя со своими критериями — отдельная лента и дедуп.
 */
export async function checkAndNotify(devices: AnalyzedDevice[]): Promise<void> {
  const enabled_users = await listEnabledNotificationSettings();
  if (enabled_users.length === 0) return;

  let total_created = 0;
  // Общий Telegram-чат: одно объявление → одно сообщение за скан, даже если
  // критерии сработали у нескольких пользователей.
  const telegram_sent_listing_ids = new Set<number>();

  for (const { user_id, settings } of enabled_users) {
    const matching = devices.filter((device) => matchesNotificationSettings(device, settings));
    if (matching.length === 0) continue;

    const unnotified_ids = new Set(
      await filterUnnotifiedListingIds(user_id, matching.map((d) => d.id)),
    );
    const to_notify = matching.filter((device) => unnotified_ids.has(device.id));
    if (to_notify.length === 0) continue;

    for (const device of to_notify) {
      let telegram_status: TelegramDeliveryStatus = "skipped";
      let telegram_error: string | null = null;

      if (!telegram_sent_listing_ids.has(device.id)) {
        const telegram = await sendTelegramMessage(buildTelegramText(device));
        telegram_status = telegram.status;
        telegram_error = telegram.error;
        if (telegram.status === "sent" || telegram.status === "not_configured") {
          telegram_sent_listing_ids.add(device.id);
        } else if (telegram.status === "failed") {
          telegram_sent_listing_ids.add(device.id);
        }
      }

      const notification = await createNotification({
        user_id,
        olx_listing_id: device.id,
        title: device.title,
        olx_url: device.olx_url,
        price_buy: device.price_buy,
        profitability_pct: device.profitability_pct,
        market_sell_price: device.market_sell_price,
        city: device.city,
        region: device.region,
        photo_url: device.photos[0] ?? null,
        source: "scan",
        telegram_status,
        telegram_error,
      });
      await deliverWebPush(notification).catch((error) => {
        console.error("[notifier] Web Push failed:", error);
      });
      total_created += 1;
    }

    await markListingsNotified(user_id, to_notify.map((d) => d.id));
  }

  if (total_created > 0) {
    console.log(`[notifier] ${total_created} новых уведомлений о хороших позициях.`);
  }
}

/** Тестовое уведомление из админки (in-app + Web Push + опционально Telegram). */
export async function sendTestNotification(params: {
  user_id: string;
  send_telegram: boolean;
}): Promise<{
  notification_id: number;
  telegram_status: TelegramDeliveryStatus;
  telegram_error: string | null;
}> {
  const title = "[TEST] SmartFlip — проверка уведомлений";
  const olx_url = "https://www.olx.pl/";
  let telegram_status: TelegramDeliveryStatus = "skipped";
  let telegram_error: string | null = null;

  if (params.send_telegram) {
    const telegram = await sendTelegramMessage(
      `${title}\nЭто тестовое сообщение из админки SmartFlip.\n${olx_url}`,
    );
    telegram_status = telegram.status;
    telegram_error = telegram.error;
  }

  const notification = await createNotification({
    user_id: params.user_id,
    olx_listing_id: 0,
    title,
    olx_url,
    price_buy: 999,
    profitability_pct: 42,
    market_sell_price: 1400,
    city: "Warszawa",
    region: "Mazowieckie",
    photo_url: null,
    source: "test",
    telegram_status,
    telegram_error,
  });

  await deliverWebPush(notification).catch((error) => {
    console.error("[notifier] Web Push failed:", error);
  });

  return {
    notification_id: notification.id,
    telegram_status,
    telegram_error,
  };
}

export async function notifyScanHealth(params: {
  status: ScanOutcomeStatus;
  message: string;
  scan_id: string;
}): Promise<void> {
  const user_ids = await listApprovedUserIds();
  if (user_ids.length === 0) return;

  const title = `${buildScanHealthTitle(params.status)}. ${params.message}`.slice(0, 280);
  await sendTelegramMessage(title).catch(() => undefined);

  for (const user_id of user_ids) {
    try {
      const notification = await createNotification({
        user_id,
        olx_listing_id: 0,
        title,
        olx_url: "/",
        price_buy: null,
        profitability_pct: null,
        market_sell_price: null,
        city: null,
        region: null,
        photo_url: null,
        source: "scan_health",
        telegram_status: "skipped",
        telegram_error: null,
      });
      await deliverWebPush(notification).catch((error) => {
        console.error("[notifier] Scan health push failed:", error);
      });
    } catch (error) {
      console.error(`[notifier] scan_health не записан для ${user_id}:`, error);
    }
  }

  console.log(`[notifier] scan_health (${params.status}) → ${user_ids.length} пользователей`);
}
