import { prisma } from "@/db/client";
import type { AllegroPart, AnalyzedDevice, DevicesFilterMeta } from "./types";
import type { Device, Part } from "@prisma/client";
import { buildDevicesFilterMeta, type DeviceFilterRow } from "./devices-filter-meta";
import { evaluateJunkStatus, type JunkFilterSettings } from "./junk-filter";
import { createLogger } from "./logger";

const db_log = createLogger("db");

type DeviceWithParts = Device & { parts: Part[] };

function mapPartToAllegroPart(part: Part): AllegroPart {
  return {
    title: part.title,
    price: part.price,
    currency: part.currency,
    url: part.url,
    image: part.image,
    damage_type: part.damage_type ?? undefined,
  };
}

export interface DevicesPageOptions {
  hidden_device_ids?: number[];
  favorite_device_ids?: number[];
  favorites_only?: boolean;
  include_hidden?: boolean;
}

function mapDeviceToAnalyzedDevice(
  device: DeviceWithParts,
  listing_context?: { favorite_ids: Set<number>; hidden_ids: Set<number> },
): AnalyzedDevice {
  return {
    id: device.id,
    title: device.title,
    olx_url: device.olx_url,
    price_buy: device.price_buy,
    price_currency: device.price_currency,
    is_negotiable: device.is_negotiable,
    brand: device.brand,
    model_query: device.model_query,
    model_key: device.model_key,
    model_label: device.model_label,
    model_line: device.model_line,
    model_line_label: device.model_line_label,
    photos: JSON.parse(device.photos) as string[],
    city: device.city,
    region: device.region,
    created_at: device.listing_created_at.toISOString(),
    release_year: device.release_year,
    has_box: device.has_box,
    battery_health_percent: device.battery_health_percent,
    storage_gb: device.storage_gb,

    seller_name: device.seller_name,
    seller_ads_count: device.seller_ads_count,
    seller_member_since: device.seller_member_since,

    damage_types: JSON.parse(device.damage_types) as string[],
    post_summary: device.post_summary,

    repairability_score: device.repairability_score,
    repairability_scale: device.repairability_scale,
    ifixit_device_name: device.ifixit_device_name,
    ifixit_url: device.ifixit_url,

    allegro_parts: device.parts.map(mapPartToAllegroPart),
    allegro_search_url: device.allegro_search_url,
    parts_cost_estimate: device.parts_cost_estimate,

    market_sell_price: device.market_sell_price,
    market_sell_price_source: device.market_sell_price_source as "model_median" | "cached_median" | "model_hint" | "brand_estimate" | null,
    profit_estimate: device.profit_estimate,
    profitability_pct: device.profitability_pct,

    liquidity_score: device.liquidity_score,
    liquidity_label: device.liquidity_label,

    is_favorite: listing_context ? listing_context.favorite_ids.has(device.id) : undefined,
    is_hidden: listing_context ? listing_context.hidden_ids.has(device.id) : undefined,

    last_analyzed_at: device.last_analyzed_at.toISOString(),
  };
}

function compareProfitabilityDesc(a: AnalyzedDevice, b: AnalyzedDevice): number {
  if (a.profitability_pct === null && b.profitability_pct === null) return 0;
  if (a.profitability_pct === null) return 1;
  if (b.profitability_pct === null) return -1;
  return b.profitability_pct - a.profitability_pct;
}

function sortByProfitabilityDesc(devices: AnalyzedDevice[]): AnalyzedDevice[] {
  return [...devices].sort(compareProfitabilityDesc);
}

async function getCachedAt(): Promise<string | null> {
  const last_completed_scan = await prisma.scanRun.findFirst({
    where: { status: "completed" },
    orderBy: { started_at: "desc" },
  });
  return last_completed_scan?.finished_at?.toISOString() ?? null;
}

const DEVICE_FILTER_SELECT = {
  id: true,
  title: true,
  price_buy: true,
  post_summary: true,
  brand: true,
  model_key: true,
  profitability_pct: true,
  model_label: true,
  model_line: true,
  model_line_label: true,
  damage_types: true,
  region: true,
  liquidity_score: true,
  release_year: true,
} as const;

type DeviceFilterSelectRow = {
  id: number;
  title: string;
  price_buy: number | null;
  post_summary: string | null;
  brand: string | null;
  model_key: string | null;
  profitability_pct: number | null;
  model_label: string | null;
  model_line: string | null;
  model_line_label: string | null;
  damage_types: string;
  region: string | null;
  liquidity_score: number | null;
  release_year: number | null;
};

interface DevicesListCache {
  cache_key: string;
  cached_at: string | null;
  visible_rows: DeviceFilterSelectRow[];
}

let devices_list_cache: DevicesListCache | null = null;

function invalidateDevicesListCache(): void {
  devices_list_cache = null;
}

function compareProfitabilityRowDesc(a: DeviceFilterSelectRow, b: DeviceFilterSelectRow): number {
  if (a.profitability_pct === null && b.profitability_pct === null) return 0;
  if (a.profitability_pct === null) return 1;
  if (b.profitability_pct === null) return -1;
  return b.profitability_pct - a.profitability_pct;
}

async function getDevicesListCache(): Promise<DevicesListCache> {
  const [filter_rows, cached_at, app_settings] = await Promise.all([
    prisma.device.findMany({ select: DEVICE_FILTER_SELECT }),
    getCachedAt(),
    getAppSettings(),
  ]);

  const cache_key = [
    cached_at ?? "none",
    app_settings.exclude_junk_listings ? "1" : "0",
    app_settings.junk_min_release_year,
  ].join(":");

  if (devices_list_cache?.cache_key === cache_key) {
    return devices_list_cache;
  }

  const junk_settings: JunkFilterSettings = {
    exclude_junk_listings: app_settings.exclude_junk_listings,
    junk_min_release_year: app_settings.junk_min_release_year,
  };

  const visible_rows = app_settings.exclude_junk_listings
    ? filter_rows.filter((row) => !evaluateJunkStatus(
      {
        title: row.title,
        post_summary: row.post_summary,
        brand: row.brand,
        model_key: row.model_key,
        price_buy: row.price_buy,
        release_year: row.release_year,
      },
      junk_settings,
    ).is_junk)
    : filter_rows;

  devices_list_cache = { cache_key, cached_at, visible_rows };
  return devices_list_cache;
}

export interface DevicesPageResult {
  devices: AnalyzedDevice[];
  total_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  cached_at: string | null;
  filter_meta: DevicesFilterMeta | null;
}

export async function getLatestDevicesPage(
  offset: number,
  limit: number,
  include_meta = false,
  page_options: DevicesPageOptions = {},
): Promise<DevicesPageResult> {
  const hidden_set = new Set(page_options.hidden_device_ids ?? []);
  const favorite_set = new Set(page_options.favorite_device_ids ?? []);

  const { visible_rows: junk_filtered_rows, cached_at } = await getDevicesListCache();

  let visible_rows = junk_filtered_rows;
  if (!page_options.include_hidden && hidden_set.size > 0) {
    visible_rows = visible_rows.filter((row) => !hidden_set.has(row.id));
  }
  if (page_options.favorites_only) {
    visible_rows = visible_rows.filter((row) => favorite_set.has(row.id));
  }

  const sorted_rows = [...visible_rows].sort(compareProfitabilityRowDesc);

  const total_count = sorted_rows.length;
  const slice_rows = sorted_rows.slice(offset, offset + limit);
  const slice_ids = slice_rows.map((row) => row.id);

  let devices: AnalyzedDevice[] = [];
  if (slice_ids.length > 0) {
    const full_devices = await prisma.device.findMany({
      where: { id: { in: slice_ids } },
      include: { parts: true },
    });
    const order_by_id = new Map(slice_ids.map((id, index) => [id, index]));
    devices = full_devices
      .map((device) => mapDeviceToAnalyzedDevice(device, { favorite_ids: favorite_set, hidden_ids: hidden_set }))
      .sort((a, b) => (order_by_id.get(a.id) ?? 0) - (order_by_id.get(b.id) ?? 0));
  }

  const filter_meta = include_meta
    ? buildDevicesFilterMeta(visible_rows as DeviceFilterRow[])
    : null;

  return {
    devices,
    total_count,
    offset,
    limit,
    has_more: offset + devices.length < total_count,
    cached_at,
    filter_meta,
  };
}

export async function saveDevices(
  scan_id: string,
  devices: AnalyzedDevice[],
  on_progress?: (processed: number, total: number) => void,
): Promise<void> {
  const save_started_at = Date.now();
  const total = devices.length;
  on_progress?.(0, total);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.device.deleteMany({});

      for (let index = 0; index < devices.length; index += 1) {
        const device = devices[index];
        await tx.device.create({
        data: {
          id: device.id,
          title: device.title,
          olx_url: device.olx_url,
          price_buy: device.price_buy,
          price_currency: device.price_currency,
          is_negotiable: device.is_negotiable,
          brand: device.brand,
          model_query: device.model_query,
          model_key: device.model_key,
          model_label: device.model_label,
          model_line: device.model_line,
          model_line_label: device.model_line_label,
          photos: JSON.stringify(device.photos),
          city: device.city,
          region: device.region,
          listing_created_at: new Date(device.created_at),
          release_year: device.release_year,
          has_box: device.has_box,
          battery_health_percent: device.battery_health_percent,
          storage_gb: device.storage_gb,

          seller_name: device.seller_name,
          seller_ads_count: device.seller_ads_count,
          seller_member_since: device.seller_member_since,

          damage_types: JSON.stringify(device.damage_types),
          post_summary: device.post_summary,

          repairability_score: device.repairability_score,
          repairability_scale: device.repairability_scale,
          ifixit_device_name: device.ifixit_device_name,
          ifixit_url: device.ifixit_url,

          allegro_search_url: device.allegro_search_url,
          parts_cost_estimate: device.parts_cost_estimate,

          market_sell_price: device.market_sell_price,
          market_sell_price_source: device.market_sell_price_source,
          profit_estimate: device.profit_estimate,
          profitability_pct: device.profitability_pct,

          liquidity_score: device.liquidity_score,
          liquidity_label: device.liquidity_label,

          last_analyzed_at: new Date(device.last_analyzed_at),
          scan_id,

          parts: {
            create: device.allegro_parts.map((part) => ({
              title: part.title,
              price: part.price,
              currency: part.currency,
              url: part.url,
              image: part.image,
              damage_type: part.damage_type ?? null,
            })),
          },
        },
      });
        const processed = index + 1;
        if (processed === total || processed % 10 === 0) {
          on_progress?.(processed, total);
        }
      }
    });
    on_progress?.(total, total);
    invalidateDevicesListCache();
    db_log.info("Устройства сохранены", {
      scan_id,
      count: total,
      duration_ms: Date.now() - save_started_at,
    });
  } catch (error) {
    db_log.error("Ошибка сохранения устройств", { scan_id, count: total }, error);
    throw error;
  }
}

export async function getLatestDevices(): Promise<{ devices: AnalyzedDevice[]; cached_at: string | null }> {
  const page = await getLatestDevicesPage(0, Number.MAX_SAFE_INTEGER, false);
  return { devices: page.devices, cached_at: page.cached_at };
}

export async function getDeviceById(
  id: number,
  listing_context?: { favorite_ids: Set<number>; hidden_ids: Set<number> },
): Promise<AnalyzedDevice | null> {
  const device = await prisma.device.findUnique({ where: { id }, include: { parts: true } });
  if (!device) return null;
  return mapDeviceToAnalyzedDevice(device, listing_context);
}

export async function createScanRun(): Promise<string> {
  const scan_run = await prisma.scanRun.create({
    data: { status: "running", stage: "fetching_listings" },
  });
  return scan_run.id;
}

export interface ScanProgressPatch {
  stage?: "fetching_listings" | "analyzing" | "finalizing" | "saving";
  total_listings?: number;
  processed_listings?: number;
}

export async function updateScanProgress(scan_id: string, patch: ScanProgressPatch): Promise<void> {
  try {
    await prisma.scanRun.update({ where: { id: scan_id }, data: patch });
  } catch {
    // Скан мог уже завершиться (finishScanRun) между постановкой обновления
    // прогресса в очередь и его выполнением — не критично, просто пропускаем.
  }
}

/**
 * Помечает как "failed" любые записи ScanRun, оставшиеся в статусе "running"
 * от предыдущего процесса (например, если сервер был остановлен/упал во время
 * скана). Без этого такая запись навечно блокирует isScanRunningInDb() и не
 * даёт запуститься ни одному новому скану. Нужно вызывать один раз при старте
 * процесса, до первого triggerScan() — в рамках уже работающего процесса
 * статус "running" легитимен и означает реально идущий скан.
 */
export async function reconcileStaleScanRuns(): Promise<void> {
  const result = await prisma.scanRun.updateMany({
    where: { status: "running" },
    data: {
      status: "failed",
      finished_at: new Date(),
      error_message: "Прервано перезапуском сервера",
    },
  });
  if (result.count > 0) {
    db_log.warn("Помечены прерванные сканы", { count: result.count });
  }
}

export async function finishScanRun(
  scan_id: string,
  devices_count: number,
  status: "completed" | "failed",
  error_message?: string,
): Promise<void> {
  await prisma.scanRun.update({
    where: { id: scan_id },
    data: {
      finished_at: new Date(),
      status,
      devices_count,
      error_message: error_message ?? null,
    },
  });
}

const APP_SETTINGS_ID = 1;

export interface AppSettingsData {
  battery_health_threshold_percent: number;
  // "Режим исключения мусора" (см. junk-filter.ts) — старые модели,
  // нереалистичные цены, лоты/сервисные объявления. junk_min_release_year —
  // ЧАСТЬ этого режима (действует только пока exclude_junk_listings = true).
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
  exclude_iphone: boolean;
  exclude_android: boolean;
  // 0 = выключено; иначе 15/30/60/180/360 (минуты) — см. scan-scheduler.ts.
  auto_scan_interval_minutes: number;
  // Часы (6-2160) — TTL для ModelCache/PartsCostCache (см. model-cache.ts).
  cache_ttl_hours: number;
}

function toAppSettingsData(settings: {
  battery_health_threshold_percent: number;
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
  exclude_iphone: boolean;
  exclude_android: boolean;
  auto_scan_interval_minutes: number;
  cache_ttl_hours: number;
}): AppSettingsData {
  return {
    battery_health_threshold_percent: settings.battery_health_threshold_percent,
    exclude_junk_listings: settings.exclude_junk_listings,
    junk_min_release_year: settings.junk_min_release_year,
    exclude_iphone: settings.exclude_iphone,
    exclude_android: settings.exclude_android,
    auto_scan_interval_minutes: settings.auto_scan_interval_minutes,
    cache_ttl_hours: settings.cache_ttl_hours,
  };
}

/**
 * Синглтон-настройки создаются лениво при первом обращении (upsert по
 * фиксированному id=1), а не миграцией с seed-данными — так поведение
 * идентично и на свежей, и на существующей базе без отдельного seed-скрипта.
 */
export async function getAppSettings(): Promise<AppSettingsData> {
  const settings = await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    update: {},
    create: { id: APP_SETTINGS_ID },
  });
  return toAppSettingsData(settings);
}

export async function updateAppSettings(patch: Partial<AppSettingsData>): Promise<AppSettingsData> {
  const settings = await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    update: patch,
    create: { id: APP_SETTINGS_ID, ...patch },
  });
  return toAppSettingsData(settings);
}

export interface ModelCacheData {
  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;
  avg_market_price: number | null;
}

/**
 * L2-кеш (переживает рестарт процесса) свойств модели, не зависящих от
 * конкретного повреждения объявления — ремонтопригодность (iFixit) и
 * кросс-скановый "якорь" рыночной цены. `expires_at` проверяется на уровне
 * запроса (WHERE gt: now), а не отдельным cron-очищением — устаревшие строки
 * просто перезаписываются при следующем upsert по тому же (brand, model_key).
 */
export async function getModelCache(brand: string, model_key: string): Promise<ModelCacheData | null> {
  const entry = await prisma.modelCache.findUnique({ where: { brand_model_key: { brand, model_key } } });
  if (!entry || entry.expires_at <= new Date()) return null;
  return {
    repairability_score: entry.repairability_score,
    repairability_scale: entry.repairability_scale,
    ifixit_device_name: entry.ifixit_device_name,
    ifixit_url: entry.ifixit_url,
    avg_market_price: entry.avg_market_price,
  };
}

export async function upsertModelCache(
  brand: string,
  model_key: string,
  patch: Partial<ModelCacheData>,
  ttl_hours: number,
): Promise<void> {
  const expires_at = new Date(Date.now() + ttl_hours * 3600_000);
  try {
    await prisma.modelCache.upsert({
      where: { brand_model_key: { brand, model_key } },
      update: { ...patch, expires_at, fetched_at: new Date() },
      create: { brand, model_key, ...patch, expires_at },
    });
  } catch {
    // Гонка между параллельными объявлениями одной модели (см.
    // runWithConcurrency) — не критично, следующий upsert перезапишет.
  }
}

export interface PartsCostCacheData {
  parts: AllegroPart[];
  search_url: string | null;
}

export async function getPartsCostCache(
  brand: string,
  model_key: string,
  damage_signature: string,
): Promise<PartsCostCacheData | null> {
  const entry = await prisma.partsCostCache.findUnique({
    where: { brand_model_key_damage_signature: { brand, model_key, damage_signature } },
  });
  if (!entry || entry.expires_at <= new Date()) return null;
  return {
    parts: entry.parts_json ? (JSON.parse(entry.parts_json) as AllegroPart[]) : [],
    search_url: entry.allegro_search_url,
  };
}

export async function upsertPartsCostCache(
  brand: string,
  model_key: string,
  damage_signature: string,
  data: PartsCostCacheData,
  ttl_hours: number,
): Promise<void> {
  const expires_at = new Date(Date.now() + ttl_hours * 3600_000);
  const patch = {
    parts_json: JSON.stringify(data.parts),
    allegro_search_url: data.search_url,
    expires_at,
    fetched_at: new Date(),
  };
  try {
    await prisma.partsCostCache.upsert({
      where: { brand_model_key_damage_signature: { brand, model_key, damage_signature } },
      update: patch,
      create: { brand, model_key, damage_signature, ...patch },
    });
  } catch {
    // Гонка между параллельными объявлениями одной модели — не критично.
  }
}

export async function getLastScanRun(): Promise<{
  id: string;
  status: string;
  started_at: Date;
  finished_at: Date | null;
  devices_count: number;
  stage: string | null;
  total_listings: number | null;
  processed_listings: number;
} | null> {
  const scan_run = await prisma.scanRun.findFirst({ orderBy: { started_at: "desc" } });
  if (!scan_run) return null;

  return {
    id: scan_run.id,
    status: scan_run.status,
    started_at: scan_run.started_at,
    finished_at: scan_run.finished_at,
    devices_count: scan_run.devices_count,
    stage: scan_run.stage,
    total_listings: scan_run.total_listings,
    processed_listings: scan_run.processed_listings,
  };
}

const NOTIFICATION_SETTINGS_ID = 1;

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

export async function getNotificationSettings(): Promise<NotificationSettingsData> {
  const settings = await prisma.notificationSettings.upsert({
    where: { id: NOTIFICATION_SETTINGS_ID },
    update: {},
    create: { id: NOTIFICATION_SETTINGS_ID },
  });
  return toNotificationSettingsData(settings);
}

export async function updateNotificationSettings(
  patch: Partial<NotificationSettingsData>,
): Promise<NotificationSettingsData> {
  const raw_patch: Record<string, unknown> = { ...patch };
  if (patch.brands !== undefined) raw_patch.brands = JSON.stringify(patch.brands);
  if (patch.model_keys !== undefined) raw_patch.model_keys = JSON.stringify(patch.model_keys);
  if (patch.regions !== undefined) raw_patch.regions = JSON.stringify(patch.regions);

  const settings = await prisma.notificationSettings.upsert({
    where: { id: NOTIFICATION_SETTINGS_ID },
    update: raw_patch,
    create: { id: NOTIFICATION_SETTINGS_ID, ...raw_patch },
  });
  return toNotificationSettingsData(settings);
}

export interface NotificationRecord {
  id: number;
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
  created_at: string;
}

export interface CreateNotificationInput {
  olx_listing_id: number;
  title: string;
  olx_url: string;
  price_buy: number | null;
  profitability_pct: number | null;
  market_sell_price: number | null;
  city: string | null;
  region: string | null;
  photo_url: string | null;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await prisma.notification.create({ data: input });
}

export async function getNotifications(limit = 50): Promise<NotificationRecord[]> {
  const rows = await prisma.notification.findMany({
    orderBy: { created_at: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
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
    created_at: row.created_at.toISOString(),
  }));
}

export async function getUnreadNotificationsCount(): Promise<number> {
  return prisma.notification.count({ where: { is_read: false } });
}

export async function markAllNotificationsRead(): Promise<void> {
  await prisma.notification.updateMany({ where: { is_read: false }, data: { is_read: true } });
}

export async function clearNotifications(): Promise<void> {
  await prisma.notification.deleteMany({});
}

/**
 * Дедупликация уведомлений между сканами по стабильному OLX id объявления —
 * без этого одно и то же попавшее под критерии объявление уведомляло бы
 * заново на каждом следующем скане, где оно снова присутствует в выдаче.
 */
export async function filterUnnotifiedListingIds(olx_listing_ids: number[]): Promise<number[]> {
  if (olx_listing_ids.length === 0) return [];
  const already_notified = await prisma.notifiedListing.findMany({
    where: { olx_listing_id: { in: olx_listing_ids } },
    select: { olx_listing_id: true },
  });
  const notified_set = new Set(already_notified.map((row) => row.olx_listing_id));
  return olx_listing_ids.filter((id) => !notified_set.has(id));
}

export async function markListingsNotified(olx_listing_ids: number[]): Promise<void> {
  if (olx_listing_ids.length === 0) return;
  // SQLite-провайдер Prisma не поддерживает createMany#skipDuplicates —
  // upsert по одному (список маленький: только реально уведомлённые за этот
  // скан объявления, не весь скан).
  await Promise.all(
    olx_listing_ids.map((olx_listing_id) =>
      prisma.notifiedListing.upsert({
        where: { olx_listing_id },
        update: {},
        create: { olx_listing_id },
      }),
    ),
  );
}
