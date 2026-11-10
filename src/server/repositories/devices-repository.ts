import { prisma } from "@/shared/db/client";
import type { AllegroPart, AnalyzedDevice, DevicesFilterMeta } from "@/shared/types/domain";
import type { Device, Part } from "@prisma/client";
import { buildDevicesFilterMeta, type DeviceFilterRow } from "@/server/domain/devices-filter-meta";
import { evaluateJunkStatus, type JunkFilterSettings } from "@/server/domain/junk-filter";
import { isPlatformExcluded, type PlatformFilterSettings } from "@/server/domain/platform-filter";
import { passesProfitFloor } from "@/server/domain/profit-floor";
import type { UserDisplaySettingsData } from "@/server/repositories/user-display-settings-repository";
import { applyUserDeviceView } from "@/server/domain/user-device-view";
import { createLogger } from "@/server/shared/logger";
import { normalizePart } from "@/shared/lib/part-utils";
import {
  filterDeviceFeed,
  paginateDeviceFeed,
  sortDeviceFeed,
  type DeviceFeedItem,
} from "@/shared/lib/device-feed-query";
import {
  DEFAULT_DEVICE_FEED_FILTERS,
  DEFAULT_DEVICE_SORT,
  type DeviceFeedFilters,
  type DeviceSortKey,
} from "@/shared/types/filters";

const db_log = createLogger("db");
const SAVE_TRANSACTION_TIMEOUT_MS = 120_000;
const SAVE_TRANSACTION_MAX_WAIT_MS = 15_000;
const DEVICE_CREATE_CHUNK = 80;
const PART_CREATE_CHUNK = 200;

type DeviceWithParts = Device & { parts: Part[] };

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}

function mapPartToAllegroPart(part: Part): AllegroPart {
  return normalizePart({
    title: part.title,
    price: part.price,
    currency: part.currency,
    url: part.url,
    image: part.image,
    damage_type: part.damage_type ?? undefined,
    is_estimate: part.is_estimate,
    source: (part.source as AllegroPart["source"]) ?? undefined,
  });
}

export interface DevicesPageOptions {
  hidden_device_ids?: number[];
  favorite_device_ids?: number[];
  favorites_only?: boolean;
  include_hidden?: boolean;
  display_settings?: UserDisplaySettingsData;
  sort?: DeviceSortKey;
  filters?: DeviceFeedFilters;
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

    confidence_score: device.confidence_score,
    confidence_label: device.confidence_label as AnalyzedDevice["confidence_label"],
    risk_adjusted_profit: device.risk_adjusted_profit,
    risk_adjusted_profitability_pct: device.risk_adjusted_profitability_pct,
    parts_real_count: device.parts_real_count,
    parts_estimate_count: device.parts_estimate_count,

    liquidity_score: device.liquidity_score,
    liquidity_label: device.liquidity_label,

    is_favorite: listing_context ? listing_context.favorite_ids.has(device.id) : undefined,
    is_hidden: listing_context ? listing_context.hidden_ids.has(device.id) : undefined,

    last_analyzed_at: device.last_analyzed_at.toISOString(),
  };
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
  listing_created_at: true,
  repairability_score: true,
  repairability_scale: true,
  profit_estimate: true,
  confidence_score: true,
  risk_adjusted_profit: true,
  risk_adjusted_profitability_pct: true,
  parts_cost_estimate: true,
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
  listing_created_at: Date;
  repairability_score: number | null;
  repairability_scale: number | null;
  profit_estimate: number | null;
  confidence_score: number | null;
  risk_adjusted_profit: number | null;
  risk_adjusted_profitability_pct: number | null;
  parts_cost_estimate: number | null;
};

interface DevicesListCache {
  cache_key: string;
  cached_at: string | null;
  filter_rows: DeviceFilterSelectRow[];
}

let devices_list_cache: DevicesListCache | null = null;

function invalidateDevicesListCache(): void {
  devices_list_cache = null;
}

function applyUserDisplayFilters(
  rows: DeviceFilterSelectRow[],
  display_settings: UserDisplaySettingsData,
): DeviceFilterSelectRow[] {
  const junk_settings: JunkFilterSettings = {
    exclude_junk_listings: display_settings.exclude_junk_listings,
    junk_min_release_year: display_settings.junk_min_release_year,
  };
  const platform_settings: PlatformFilterSettings = {
    exclude_iphone: display_settings.exclude_iphone,
    exclude_android: display_settings.exclude_android,
  };

  return rows.filter((row) => {
    if (display_settings.exclude_junk_listings) {
      const junk_result = evaluateJunkStatus(
        {
          title: row.title,
          post_summary: row.post_summary ?? "",
          brand: row.brand ?? "unknown",
          model_key: row.model_key ?? "",
          price_buy: row.price_buy,
          release_year: row.release_year,
        },
        junk_settings,
      );
      if (junk_result.is_junk) return false;
    }

    if (isPlatformExcluded(
      row.brand ?? "unknown",
      row.title,
      row.model_key ?? "",
      platform_settings,
    )) {
      return false;
    }

    if (!passesProfitFloor({
      price_buy: row.price_buy,
      risk_adjusted_profit: row.risk_adjusted_profit,
      profit_estimate: row.profit_estimate,
    }, {
      exclude_unprofitable: display_settings.exclude_unprofitable,
      min_profit_pln: display_settings.min_profit_pln,
      min_profit_pct_of_price: display_settings.min_profit_pct_of_price,
    })) {
      return false;
    }

    return true;
  });
}

function toFeedItem(row: DeviceFilterSelectRow): DeviceFeedItem {
  return {
    id: row.id,
    brand: row.brand ?? "unknown",
    model_key: row.model_key ?? "",
    model_label: row.model_label ?? "",
    model_line: row.model_line ?? "",
    damage_types: JSON.parse(row.damage_types) as string[],
    region: row.region,
    price_buy: row.price_buy,
    created_at: row.listing_created_at.toISOString(),
    release_year: row.release_year,
    repairability_score: row.repairability_score,
    repairability_scale: row.repairability_scale,
    liquidity_score: row.liquidity_score,
    profit_estimate: row.profit_estimate,
    profitability_pct: row.profitability_pct,
    confidence_score: row.confidence_score,
    risk_adjusted_profit: row.risk_adjusted_profit,
    risk_adjusted_profitability_pct: row.risk_adjusted_profitability_pct,
    parts_cost_estimate: row.parts_cost_estimate,
  };
}

async function getDevicesListCache(): Promise<DevicesListCache> {
  const [filter_rows, cached_at] = await Promise.all([
    prisma.device.findMany({ select: DEVICE_FILTER_SELECT }),
    getCachedAt(),
  ]);

  const cache_key = cached_at ?? "none";

  if (devices_list_cache?.cache_key === cache_key) {
    return devices_list_cache;
  }

  devices_list_cache = { cache_key, cached_at, filter_rows };
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

  const { filter_rows, cached_at } = await getDevicesListCache();

  const display_settings = page_options.display_settings;
  let visible_rows = display_settings
    ? applyUserDisplayFilters(filter_rows, display_settings)
    : filter_rows;
  if (!page_options.include_hidden && hidden_set.size > 0) {
    visible_rows = visible_rows.filter((row) => !hidden_set.has(row.id));
  }
  if (page_options.favorites_only) {
    visible_rows = visible_rows.filter((row) => favorite_set.has(row.id));
  }

  const feed_items = visible_rows.map(toFeedItem);
  const filtered_items = filterDeviceFeed(
    feed_items,
    page_options.filters ?? DEFAULT_DEVICE_FEED_FILTERS,
  );
  const sorted_items = sortDeviceFeed(
    filtered_items,
    page_options.sort ?? DEFAULT_DEVICE_SORT,
  );
  const page_slice = paginateDeviceFeed(sorted_items, offset, limit);
  const slice_ids = page_slice.items.map((row) => row.id);

  let devices: AnalyzedDevice[] = [];
  if (slice_ids.length > 0) {
    const full_devices = await prisma.device.findMany({
      where: { id: { in: slice_ids } },
      include: { parts: true },
    });
    const order_by_id = new Map(slice_ids.map((id, index) => [id, index]));
    devices = full_devices
      .map((device) => {
        const mapped = mapDeviceToAnalyzedDevice(device, { favorite_ids: favorite_set, hidden_ids: hidden_set });
        return display_settings ? applyUserDeviceView(mapped, display_settings) : mapped;
      })
      .sort((a, b) => (order_by_id.get(a.id) ?? 0) - (order_by_id.get(b.id) ?? 0));
  }

  const filter_meta = include_meta
    ? buildDevicesFilterMeta(visible_rows as DeviceFilterRow[])
    : null;

  return {
    devices,
    total_count: page_slice.total_count,
    offset,
    limit,
    has_more: page_slice.has_more,
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

  const device_rows = devices.map((device) => ({
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
    confidence_score: device.confidence_score,
    confidence_label: device.confidence_label,
    risk_adjusted_profit: device.risk_adjusted_profit,
    risk_adjusted_profitability_pct: device.risk_adjusted_profitability_pct,
    parts_real_count: device.parts_real_count,
    parts_estimate_count: device.parts_estimate_count,
    liquidity_score: device.liquidity_score,
    liquidity_label: device.liquidity_label,
    last_analyzed_at: new Date(device.last_analyzed_at),
    scan_id,
  }));

  const part_rows = devices.flatMap((device) =>
    device.allegro_parts.map((part) => ({
      title: part.title,
      price: part.price,
      currency: part.currency,
      url: part.url,
      image: part.image,
      damage_type: part.damage_type ?? null,
      is_estimate: part.is_estimate ?? false,
      source: part.source ?? null,
      device_id: device.id,
    })),
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.device.deleteMany({});

      for (const chunk of chunkItems(device_rows, DEVICE_CREATE_CHUNK)) {
        await tx.device.createMany({ data: chunk });
      }
      on_progress?.(Math.max(1, Math.ceil(total / 2)), total);

      for (const chunk of chunkItems(part_rows, PART_CREATE_CHUNK)) {
        await tx.part.createMany({ data: chunk });
      }
    }, {
      timeout: SAVE_TRANSACTION_TIMEOUT_MS,
      maxWait: SAVE_TRANSACTION_MAX_WAIT_MS,
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

export async function getLatestDeviceFingerprints(): Promise<Array<{
  id: number;
  title: string;
  price_buy: number | null;
}>> {
  return prisma.device.findMany({
    select: { id: true, title: true, price_buy: true },
  });
}

export async function getDevicesByIds(ids: number[]): Promise<AnalyzedDevice[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.device.findMany({
    where: { id: { in: ids } },
    include: { parts: true },
  });
  const order_by_id = new Map(ids.map((id, index) => [id, index]));
  return rows
    .map((device) => mapDeviceToAnalyzedDevice(device))
    .sort((a, b) => (order_by_id.get(a.id) ?? 0) - (order_by_id.get(b.id) ?? 0));
}

export async function countStoredDevices(): Promise<number> {
  return prisma.device.count();
}

export async function getDeviceById(
  id: number,
  listing_context?: { favorite_ids: Set<number>; hidden_ids: Set<number> },
  display_settings?: UserDisplaySettingsData,
): Promise<AnalyzedDevice | null> {
  const device = await prisma.device.findUnique({ where: { id }, include: { parts: true } });
  if (!device) return null;
  const mapped = mapDeviceToAnalyzedDevice(device, listing_context);
  if (!display_settings) return mapped;
  return applyUserDeviceView(mapped, display_settings);
}

export async function updateDeviceListingSignals(
  id: number,
  patch: {
    post_summary: string;
    seller_name: string | null;
    seller_ads_count: number | null;
    seller_member_since: string | null;
    damage_types: string[];
    has_box: boolean;
    battery_health_percent: number | null;
  },
): Promise<void> {
  await prisma.device.update({
    where: { id },
    data: {
      post_summary: patch.post_summary,
      seller_name: patch.seller_name,
      seller_ads_count: patch.seller_ads_count,
      seller_member_since: patch.seller_member_since,
      damage_types: JSON.stringify(patch.damage_types),
      has_box: patch.has_box,
      battery_health_percent: patch.battery_health_percent,
    },
  });
  invalidateDevicesListCache();
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
  const { forceReleaseScanLock } = await import("@/server/repositories/scan-coordinator-repository");
  await forceReleaseScanLock();
}

export async function expireStaleScanRuns(max_age_minutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - max_age_minutes * 60_000);
  const result = await prisma.scanRun.updateMany({
    where: {
      status: "running",
      started_at: { lt: cutoff },
    },
    data: {
      status: "failed",
      finished_at: new Date(),
      error_message: `Watchdog: скан дольше ${max_age_minutes} мин`,
    },
  });
  if (result.count > 0) {
    db_log.warn("Watchdog: зависшие сканы помечены failed", { count: result.count });
    const { forceReleaseScanLock } = await import("@/server/repositories/scan-coordinator-repository");
    await forceReleaseScanLock();
  }
  return result.count;
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
  // 0 = выключено; иначе 15/30/60/180/360 (минуты) — см. scan-scheduler.ts.
  auto_scan_interval_minutes: number;
  // Часы (6-2160) — TTL для ModelCache/PartsCostCache (см. model-cache.ts).
  cache_ttl_hours: number;
  shipping_parts_pln: number;
  shipping_to_repair_pln: number;
  shipping_to_customer_pln: number;
  repair_labor_base_pln: number;
  subscription_basic_pln: number;
  subscription_pro_pln: number;
  allegro_parts_auto_enabled: boolean;
  catalog_auto_enrich_interval_minutes: number;
  catalog_antibot_wait_seconds: number;
  catalog_antibot_retries: number;
  catalog_source_delay_ms: number;
}

export type LogisticsSettings = Pick<
  AppSettingsData,
  "shipping_parts_pln" | "shipping_to_repair_pln" | "shipping_to_customer_pln" | "repair_labor_base_pln"
>;

export function toLogisticsSettings(settings: AppSettingsData): LogisticsSettings {
  return {
    shipping_parts_pln: settings.shipping_parts_pln,
    shipping_to_repair_pln: settings.shipping_to_repair_pln,
    shipping_to_customer_pln: settings.shipping_to_customer_pln,
    repair_labor_base_pln: settings.repair_labor_base_pln,
  };
}

function toAppSettingsData(settings: {
  battery_health_threshold_percent: number;
  auto_scan_interval_minutes: number;
  cache_ttl_hours: number;
  shipping_parts_pln: number;
  shipping_to_repair_pln: number;
  shipping_to_customer_pln: number;
  repair_labor_base_pln: number;
  subscription_basic_pln: number;
  subscription_pro_pln: number;
  allegro_parts_auto_enabled: boolean;
  catalog_auto_enrich_interval_minutes: number;
  catalog_antibot_wait_seconds: number;
  catalog_antibot_retries: number;
  catalog_source_delay_ms: number;
}): AppSettingsData {
  return {
    battery_health_threshold_percent: settings.battery_health_threshold_percent,
    auto_scan_interval_minutes: settings.auto_scan_interval_minutes,
    cache_ttl_hours: settings.cache_ttl_hours,
    shipping_parts_pln: settings.shipping_parts_pln,
    shipping_to_repair_pln: settings.shipping_to_repair_pln,
    shipping_to_customer_pln: settings.shipping_to_customer_pln,
    repair_labor_base_pln: settings.repair_labor_base_pln,
    subscription_basic_pln: settings.subscription_basic_pln,
    subscription_pro_pln: settings.subscription_pro_pln,
    allegro_parts_auto_enabled: settings.allegro_parts_auto_enabled,
    catalog_auto_enrich_interval_minutes: settings.catalog_auto_enrich_interval_minutes,
    catalog_antibot_wait_seconds: settings.catalog_antibot_wait_seconds,
    catalog_antibot_retries: settings.catalog_antibot_retries,
    catalog_source_delay_ms: settings.catalog_source_delay_ms,
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
  kimovil_geek_score?: number | null;
  kimovil_user_score?: number | null;
  kimovil_combined_score?: number | null;
  kimovil_matched_name?: string | null;
}

/**
 * L2-кеш (переживает рестарт процесса) свойств модели, не зависящих от
 * конкретного повреждения объявления — ремонтопригодность (iFixit) и
 * кросс-скановый "якорь" рыночной цены. `expires_at` проверяется на уровне
 * запроса (WHERE gt: now), а не отдельным cron-очищением — устаревшие строки
 * просто перезаписываются при следующем upsert по тому же (brand, model_key).
 */
function mapModelCacheRow(entry: {
  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;
  avg_market_price: number | null;
  kimovil_geek_score: number | null;
  kimovil_user_score: number | null;
  kimovil_combined_score: number | null;
  kimovil_matched_name: string | null;
}): ModelCacheData {
  return {
    repairability_score: entry.repairability_score,
    repairability_scale: entry.repairability_scale,
    ifixit_device_name: entry.ifixit_device_name,
    ifixit_url: entry.ifixit_url,
    avg_market_price: entry.avg_market_price,
    kimovil_geek_score: entry.kimovil_geek_score,
    kimovil_user_score: entry.kimovil_user_score,
    kimovil_combined_score: entry.kimovil_combined_score,
    kimovil_matched_name: entry.kimovil_matched_name,
  };
}

export async function getModelCache(brand: string, model_key: string): Promise<ModelCacheData | null> {
  const entry = await prisma.modelCache.findUnique({ where: { brand_model_key: { brand, model_key } } });
  if (!entry || entry.expires_at <= new Date()) return null;
  return mapModelCacheRow(entry);
}

export async function listFreshModelCaches(): Promise<Map<string, ModelCacheData>> {
  const now = new Date();
  const rows = await prisma.modelCache.findMany({ where: { expires_at: { gt: now } } });
  const map = new Map<string, ModelCacheData>();
  for (const row of rows) {
    map.set(`${row.brand}::${row.model_key}`, mapModelCacheRow(row));
  }
  return map;
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

export interface ModelMedianCacheItem {
  brand: string;
  model_key: string;
  avg_market_price: number;
}

/** Одна транзакция вместо сотен одиночных upsert — для фоновой записи медиан после скана. */
export async function upsertModelCacheBatch(
  items: ModelMedianCacheItem[],
  ttl_hours: number,
): Promise<number> {
  if (items.length === 0) return 0;
  const expires_at = new Date(Date.now() + ttl_hours * 3600_000);
  const fetched_at = new Date();
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.modelCache.upsert({
        where: { brand_model_key: { brand: item.brand, model_key: item.model_key } },
        update: { avg_market_price: item.avg_market_price, expires_at, fetched_at },
        create: {
          brand: item.brand,
          model_key: item.model_key,
          avg_market_price: item.avg_market_price,
          expires_at,
        },
      });
    }
  }, { timeout: 60_000, maxWait: 10_000 });
  return items.length;
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
  const raw_parts = entry.parts_json ? (JSON.parse(entry.parts_json) as AllegroPart[]) : [];
  return {
    parts: raw_parts.map(normalizePart),
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

export interface CachedPartsRow {
  damage_signature: string;
  parts_cost_estimate: number | null;
  allegro_search_url: string | null;
  parts: AllegroPart[];
  fetched_at: string;
  expires_at: string;
}

export async function listPartsCachesForModel(
  brand: string,
  model_key: string,
): Promise<CachedPartsRow[]> {
  const rows = await prisma.partsCostCache.findMany({
    where: { brand, model_key },
    orderBy: { fetched_at: "desc" },
  });
  return rows.map((row) => ({
    damage_signature: row.damage_signature,
    parts_cost_estimate: row.parts_cost_estimate,
    allegro_search_url: row.allegro_search_url,
    parts: row.parts_json ? (JSON.parse(row.parts_json) as AllegroPart[]) : [],
    fetched_at: row.fetched_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
  }));
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
  issues_count: number;
  warnings_count: number;
  error_message: string | null;
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
    issues_count: scan_run.issues_count,
    warnings_count: scan_run.warnings_count,
    error_message: scan_run.error_message,
  };
}

