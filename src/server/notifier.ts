import { config } from "./config";
import {
  getNotificationSettings,
  filterUnnotifiedListingIds,
  markListingsNotified,
  createNotification,
  type NotificationSettingsData,
} from "./devices-repository";
import type { AnalyzedDevice } from "./types";

function matchesSettings(device: AnalyzedDevice, settings: NotificationSettingsData): boolean {
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

async function sendTelegramMessage(device: AnalyzedDevice): Promise<void> {
  const { bot_token, chat_id } = config.telegram;
  if (!bot_token || !chat_id) return;

  const lines = [
    `📱 ${device.title}`,
    device.price_buy !== null ? `💰 Cena: ${device.price_buy} zł` : null,
    device.profitability_pct !== null ? `📈 Rentowność: ${device.profitability_pct}%` : null,
    device.market_sell_price !== null ? `🏷 Szac. cena sprzedaży: ${device.market_sell_price} zł` : null,
    device.city ? `📍 ${device.city}${device.region ? `, ${device.region}` : ""}` : null,
    device.olx_url,
  ].filter((line): line is string => line !== null);

  try {
    await fetch(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        text: lines.join("\n"),
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error("[notifier] Не удалось отправить сообщение в Telegram:", error);
  }
}

/**
 * Вызывается после сохранения устройств КАЖДОГО скана (scan-manager.ts).
 * Дедупликация — по стабильному OLX id (NotifiedListing), а не по каждому
 * запуску заново, иначе одно и то же попавшее под критерии объявление
 * уведомляло бы повторно на каждом следующем скане, где оно всё ещё есть в
 * выдаче (объявления живут на OLX от нескольких дней до нескольких недель).
 */
export async function checkAndNotify(devices: AnalyzedDevice[]): Promise<void> {
  const settings = await getNotificationSettings();
  if (!settings.enabled) return;

  const matching = devices.filter((device) => matchesSettings(device, settings));
  if (matching.length === 0) return;

  const unnotified_ids = new Set(await filterUnnotifiedListingIds(matching.map((d) => d.id)));
  const to_notify = matching.filter((device) => unnotified_ids.has(device.id));
  if (to_notify.length === 0) return;

  for (const device of to_notify) {
    await createNotification({
      olx_listing_id: device.id,
      title: device.title,
      olx_url: device.olx_url,
      price_buy: device.price_buy,
      profitability_pct: device.profitability_pct,
      market_sell_price: device.market_sell_price,
      city: device.city,
      region: device.region,
      photo_url: device.photos[0] ?? null,
    });
    await sendTelegramMessage(device);
  }

  await markListingsNotified(to_notify.map((d) => d.id));
  console.log(`[notifier] ${to_notify.length} новых уведомлений о хороших позициях.`);
}
