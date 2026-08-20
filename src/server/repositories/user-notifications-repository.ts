import { prisma } from "@/shared/db/client";
import { publishNotificationUpdate } from "@/server/shared/live-hub";

export type NotificationSource = "scan" | "test" | "scan_health";
export type TelegramDeliveryStatus = "skipped" | "sent" | "failed" | "not_configured";

export interface NotificationSettingsData {
  enabled: boolean;
  brands: string[];
  model_keys: string[];
  min_profitability_pct: number | null;
  max_profitability_pct: number | null;
  min_price: number | null;
  max_price: number | null;
  regions: string[];
}

export interface NotificationRecord {
  id: number;
  user_id: string;
  olx_listing_id: number;
  title: string;
  olx_url: string;
  price_buy: number | null;
  profitability_pct: number | null;
  market_sell_price: number | null;
  city: string | null;
  region: string | null;
  photo_url: string | null;
  is_read: boolean;
  source: NotificationSource;
  telegram_status: TelegramDeliveryStatus;
  telegram_error: string | null;
  created_at: string;
}

export interface AdminNotificationLogRow extends NotificationRecord {
  user_email: string;
  user_name: string | null;
}

export interface CreateNotificationInput {
  user_id: string;
  olx_listing_id: number;
  title: string;
  olx_url: string;
  price_buy: number | null;
  profitability_pct: number | null;
  market_sell_price: number | null;
  city: string | null;
  region: string | null;
  photo_url: string | null;
  source?: NotificationSource;
  telegram_status?: TelegramDeliveryStatus;
  telegram_error?: string | null;
}

function toNotificationSettingsData(settings: {
  enabled: boolean;
  brands: string;
  model_keys: string;
  min_profitability_pct: number | null;
  max_profitability_pct: number | null;
  min_price: number | null;
  max_price: number | null;
  regions: string;
}): NotificationSettingsData {
  return {
    enabled: settings.enabled,
    brands: JSON.parse(settings.brands) as string[],
    model_keys: JSON.parse(settings.model_keys) as string[],
    min_profitability_pct: settings.min_profitability_pct,
    max_profitability_pct: settings.max_profitability_pct,
    min_price: settings.min_price,
    max_price: settings.max_price,
    regions: JSON.parse(settings.regions) as string[],
  };
}

function toNotificationRecord(row: {
  id: number;
  user_id: string;
  olx_listing_id: number;
  title: string;
  olx_url: string;
  price_buy: number | null;
  profitability_pct: number | null;
  market_sell_price: number | null;
  city: string | null;
  region: string | null;
  photo_url: string | null;
  is_read: boolean;
  source: string;
  telegram_status: string;
  telegram_error: string | null;
  created_at: Date;
}): NotificationRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    olx_listing_id: row.olx_listing_id,
    title: row.title,
    olx_url: row.olx_url,
    price_buy: row.price_buy,
    profitability_pct: row.profitability_pct,
    market_sell_price: row.market_sell_price,
    city: row.city,
    region: row.region,
    photo_url: row.photo_url,
    is_read: row.is_read,
    source: row.source as NotificationSource,
    telegram_status: row.telegram_status as TelegramDeliveryStatus,
    telegram_error: row.telegram_error,
    created_at: row.created_at.toISOString(),
  };
}

export async function getUserNotificationSettings(user_id: string): Promise<NotificationSettingsData> {
  const settings = await prisma.userNotificationSettings.upsert({
    where: { user_id },
    update: {},
    create: { user_id },
  });
  return toNotificationSettingsData(settings);
}

export async function updateUserNotificationSettings(
  user_id: string,
  patch: Partial<NotificationSettingsData>,
): Promise<NotificationSettingsData> {
  const raw_patch: Record<string, unknown> = { ...patch };
  if (patch.brands !== undefined) raw_patch.brands = JSON.stringify(patch.brands);
  if (patch.model_keys !== undefined) raw_patch.model_keys = JSON.stringify(patch.model_keys);
  if (patch.regions !== undefined) raw_patch.regions = JSON.stringify(patch.regions);

  const settings = await prisma.userNotificationSettings.upsert({
    where: { user_id },
    update: raw_patch,
    create: { user_id, ...raw_patch },
  });
  return toNotificationSettingsData(settings);
}

export interface EnabledUserNotificationSettings {
  user_id: string;
  settings: NotificationSettingsData;
}

/** Все пользователи с включёнными уведомлениями — для checkAndNotify после скана. */
export async function listEnabledNotificationSettings(): Promise<EnabledUserNotificationSettings[]> {
  const rows = await prisma.userNotificationSettings.findMany({
    where: { enabled: true },
  });
  return rows.map((row) => ({
    user_id: row.user_id,
    settings: toNotificationSettingsData(row),
  }));
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationRecord> {
  const row = await prisma.notification.create({
    data: {
      user_id: input.user_id,
      olx_listing_id: input.olx_listing_id,
      title: input.title,
      olx_url: input.olx_url,
      price_buy: input.price_buy,
      profitability_pct: input.profitability_pct,
      market_sell_price: input.market_sell_price,
      city: input.city,
      region: input.region,
      photo_url: input.photo_url,
      source: input.source ?? "scan",
      telegram_status: input.telegram_status ?? "skipped",
      telegram_error: input.telegram_error ?? null,
    },
  });
  const record = toNotificationRecord(row);
  publishNotificationUpdate(input.user_id);
  return record;
}

export async function getUserNotifications(user_id: string, limit = 50): Promise<NotificationRecord[]> {
  const rows = await prisma.notification.findMany({
    where: { user_id },
    orderBy: { created_at: "desc" },
    take: limit,
  });
  return rows.map(toNotificationRecord);
}

export async function getUnreadNotificationsCount(user_id: string): Promise<number> {
  return prisma.notification.count({ where: { user_id, is_read: false } });
}

export async function getNotificationsSince(
  user_id: string,
  since_id: number,
  limit = 20,
): Promise<NotificationRecord[]> {
  if (since_id <= 0) return [];
  const rows = await prisma.notification.findMany({
    where: { user_id, id: { gt: since_id } },
    orderBy: { id: "asc" },
    take: limit,
  });
  return rows.map(toNotificationRecord);
}

export async function getNotificationsLiveSnapshot(
  user_id: string,
  since_id = 0,
): Promise<{ count: number; cursor: number; items: NotificationRecord[] }> {
  const [count, latest, items] = await Promise.all([
    getUnreadNotificationsCount(user_id),
    prisma.notification.findFirst({
      where: { user_id },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
    getNotificationsSince(user_id, since_id),
  ]);
  return {
    count,
    cursor: latest?.id ?? 0,
    items,
  };
}

export async function markAllNotificationsRead(user_id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { user_id, is_read: false },
    data: { is_read: true },
  });
  publishNotificationUpdate(user_id);
}

export async function clearUserNotifications(user_id: string): Promise<void> {
  await prisma.notification.deleteMany({ where: { user_id } });
  publishNotificationUpdate(user_id);
}

/**
 * Дедупликация per-user по стабильному OLX id — без этого одно и то же
 * объявление уведомляло бы заново на каждом следующем скане.
 */
export async function filterUnnotifiedListingIds(
  user_id: string,
  olx_listing_ids: number[],
): Promise<number[]> {
  if (olx_listing_ids.length === 0) return [];
  const already_notified = await prisma.notifiedListing.findMany({
    where: { user_id, olx_listing_id: { in: olx_listing_ids } },
    select: { olx_listing_id: true },
  });
  const notified_set = new Set(already_notified.map((row) => row.olx_listing_id));
  return olx_listing_ids.filter((id) => !notified_set.has(id));
}

export async function markListingsNotified(user_id: string, olx_listing_ids: number[]): Promise<void> {
  if (olx_listing_ids.length === 0) return;
  await Promise.all(
    olx_listing_ids.map((olx_listing_id) =>
      prisma.notifiedListing.upsert({
        where: { user_id_olx_listing_id: { user_id, olx_listing_id } },
        update: {},
        create: { user_id, olx_listing_id },
      }),
    ),
  );
}

export interface AdminNotificationsPage {
  items: AdminNotificationLogRow[];
  total_count: number;
}

export async function getAdminNotificationsPage(params: {
  offset?: number;
  limit?: number;
  user_id?: string;
  source?: NotificationSource;
}): Promise<AdminNotificationsPage> {
  const offset = params.offset ?? 0;
  const limit = Math.min(params.limit ?? 50, 200);
  const where = {
    ...(params.user_id ? { user_id: params.user_id } : {}),
    ...(params.source ? { source: params.source } : {}),
  };

  const [rows, total_count] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit,
      include: { user: { select: { email: true, name: true } } },
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    total_count,
    items: rows.map((row) => ({
      ...toNotificationRecord(row),
      user_email: row.user.email,
      user_name: row.user.name,
    })),
  };
}
