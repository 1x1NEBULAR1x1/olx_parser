import { fetchOlxListingsForStates, type ParsedOlxListing } from "@/server/fetchers/olx-fetcher/fetcher";
import { detectDamageTypesFromText, detectHasBox, extractBatteryHealthPercent, extractOlxListingSignals, lookupIfixitDeviceMatch } from "@/server/fetchers/olx-fetcher/fix-parser";
import { LiquidityCalculator } from "@/server/domain/liquidity-calculator/calculator";
import { OLX_2026_MARKET_SNAPSHOT_BY_BRAND, BOX_AND_ACCESSORIES_BONUS_SCORE } from "@/server/domain/liquidity-calculator/constants";
import { getReleaseYear } from "@/server/domain/liquidity-calculator/release-year-hints";
import { config } from "@/server/shared/config";
import { getIfixitCache, setIfixitCache } from "@/server/shared/cache";
import { estimateDamagedResalePrice, estimateMarketSellPrice, extractBrand } from "@/server/domain/brand-extractor";
import { extractStorageGb, getModelMarketPrice, getStorageMultiplier, MARKET_REFERENCE_STORAGE_GB } from "@/server/domain/model-market-price-hints";
import { extractModelKey } from "@/server/domain/model-normalizer";
import { extractModelLine } from "@/server/domain/model-line-extractor";
import { clusterModelKeys } from "@/server/domain/model-key-clusterer";
import { computeDeviceAnalytics } from "@/server/domain/device-analytics";
import { estimatePartsCost } from "@/server/domain/profitability";
import {
  buildIfixitSearchStubUrl,
  buildStaticPartStubs,
  getRepairabilityStub,
} from "@/server/domain/repair-parts-stubs";
import {
  getAppSettings,
  getDevicesByIds,
  getLatestDeviceFingerprints,
  listFreshModelCaches,
  type ModelCacheData,
  type ModelMedianCacheItem,
} from "@/server/repositories/devices-repository";
import type { AnalyzedDevice, AllegroPart } from "@/shared/types/domain";
import { classifyListingError, detectDeviceWarnings } from "./scan-issue-detector";
import { ScanIssueCollector } from "@/server/repositories/scan-issues-repository";
import { createLogger, formatDuration } from "@/server/shared/logger";
import { runWithConcurrency, withTimeout } from "./run-with-concurrency";
import { fetchPartsData, type PartsCacheWrite } from "./parts-chain";
import {
  loadCatalogLookup,
  resolveCatalogSellPrice,
  type CatalogLookup,
  type CatalogMarketPriceSnapshot,
} from "@/server/catalog/catalog-resolver";
import { idsNeedingAnalysis, partitionDeltaScan } from "./delta-scan";
import { scoreListingCandidate, selectListingsForFullAnalysis } from "./listing-prefilter";
import { resolveScanOutcome, shouldReplaceFeed, type ScanPipelineOutcome } from "./scan-outcome";

const pipeline_log = createLogger("pipeline");

const liquidity_calculator = new LiquidityCalculator();

// Используется как release_year, когда справочник release-year-hints.ts не
// знает конкретную модель — тот же дефолт, который раньше был жёстко
// прописан для ВСЕХ устройств (см. TODO.md про известное ограничение
// эвристики года выпуска).
const FALLBACK_RELEASE_YEAR = 2022;

export interface IfixitCacheWrite {
  brand: string;
  model_key: string;
  patch: {
    repairability_score: number | null;
    repairability_scale: number | null;
    ifixit_device_name: string | null;
    ifixit_url: string | null;
  };
  cache_ttl_hours: number;
}

interface ScanReadCaches {
  catalog: CatalogLookup;
  model_cache: Map<string, ModelCacheData>;
}

interface ScanWriteBuffers {
  ifixit: IfixitCacheWrite[];
  parts: PartsCacheWrite[];
}

// Минимум сравнимых необорудованных повреждениями объявлений той же модели
// в ЭТОМ скане, при котором медиана считается статистически осмысленной —
// иначе (0 или 1 объявление) откатываемся на старую формулу-эвристику от
// бренда, чтобы не строить "медиану" по единичному выбросу.
const MIN_COMPARABLE_LISTINGS_FOR_MEDIAN = 2;

interface LiquidityScoreParams {
  brand: string;
  model_query: string;
  model_key: string;
  release_year: number | null;
  has_box: boolean;
  battery_health_percent: number | null;
  storage_gb: number | null;
  market_median_price: number | null;
  damage_types: string[];
  geek_score?: number | null;
  user_score?: number | null;
}

// Раньше condition_score был жёстко зашит как 45 для ВСЕХ объявлений — ни
// повреждения, ни состояние батареи не влияли на итоговую ликвидность.
// Базовое значение 88 — исправный телефон в хорошем косметическом состоянии;
// каждый обнаруженный тип повреждения снижает оценку (несколько повреждений
// сильнее бьют по привлекательности лота, чем одно), низкая батарея добавляет
// дополнительный штраф сверху отдельного battery_score в hardware_score.
const CONDITION_SCORE_BASELINE = 88;
const CONDITION_SCORE_PENALTY_PER_DAMAGE_TYPE = 14;
const CONDITION_SCORE_BATTERY_PENALTY_PER_PERCENT_BELOW_90 = 0.4;
const CONDITION_SCORE_MIN = 15;
const CONDITION_SCORE_MAX = 95;

function computeConditionScore(damage_types: string[], battery_health_percent: number | null): number {
  let score = CONDITION_SCORE_BASELINE;
  score -= damage_types.length * CONDITION_SCORE_PENALTY_PER_DAMAGE_TYPE;
  if (battery_health_percent !== null && battery_health_percent < 90) {
    score -= (90 - battery_health_percent) * CONDITION_SCORE_BATTERY_PENALTY_PER_PERCENT_BELOW_90;
  }
  return Math.min(CONDITION_SCORE_MAX, Math.max(CONDITION_SCORE_MIN, score));
}

function getLiquidityScore(params: LiquidityScoreParams): {
  liquidity_score: number | null;
  liquidity_label: string | null;
} {
  try {
    const market_snapshot = OLX_2026_MARKET_SNAPSHOT_BY_BRAND as Record<string, { monthly_sales_count: number; active_listings_count: number }>;
    const snapshot = market_snapshot[params.brand];

    const scenario = liquidity_calculator.calculate({
      brand_name: params.brand,
      model_name: params.model_query,
      model_key: params.model_key,
      release_year: params.release_year ?? FALLBACK_RELEASE_YEAR,
      condition_score: computeConditionScore(params.damage_types, params.battery_health_percent),
      storage_gb: params.storage_gb ?? MARKET_REFERENCE_STORAGE_GB,
      has_box_and_accessories: params.has_box,
      battery_health_percent: params.battery_health_percent ?? undefined,
      market_median_price: params.market_median_price ?? undefined,
      monthly_sales_count: snapshot?.monthly_sales_count,
      active_listings_count: snapshot?.active_listings_count,
      geek_score: params.geek_score ?? undefined,
      user_score: params.user_score ?? undefined,
    });

    const result = scenario.avg();
    return {
      liquidity_score: result.liquidity_score,
      liquidity_label: result.liquidity_label,
    };
  } catch {
    return { liquidity_score: null, liquidity_label: null };
  }
}

async function resolveIfixitDataForQuery(
  device_query: string,
  brand: string,
  model_key: string,
  cache_ttl_hours: number,
  caches: ScanReadCaches,
  writes: ScanWriteBuffers,
  options: { allow_network?: boolean } = {},
): Promise<{
  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;
  release_year: number | null;
}> {
  const cached = getIfixitCache(device_query);
  if (cached) {
    return {
      repairability_score: cached.repairability_score,
      repairability_scale: cached.repairability_scale,
      ifixit_device_name: cached.device_name,
      ifixit_url: cached.device_url,
      release_year: null,
    };
  }

  const catalog_repair = caches.catalog.getRepairability(brand, model_key);
  if (catalog_repair) {
    setIfixitCache(device_query, {
      repairability_score: catalog_repair.repairability_score,
      repairability_scale: catalog_repair.repairability_scale,
      device_name: catalog_repair.ifixit_device_name,
      device_url: catalog_repair.ifixit_url,
    });
    return {
      repairability_score: catalog_repair.repairability_score,
      repairability_scale: catalog_repair.repairability_scale,
      ifixit_device_name: catalog_repair.ifixit_device_name,
      ifixit_url: catalog_repair.ifixit_url,
      release_year: catalog_repair.release_year,
    };
  }

  const db_cached = caches.model_cache.get(`${brand}::${model_key}`);
  if (db_cached && (db_cached.repairability_score !== null || db_cached.ifixit_device_name !== null)) {
    setIfixitCache(device_query, {
      repairability_score: db_cached.repairability_score,
      repairability_scale: db_cached.repairability_scale,
      device_name: db_cached.ifixit_device_name,
      device_url: db_cached.ifixit_url,
    });
    return {
      repairability_score: db_cached.repairability_score,
      repairability_scale: db_cached.repairability_scale,
      ifixit_device_name: db_cached.ifixit_device_name,
      ifixit_url: db_cached.ifixit_url,
      release_year: null,
    };
  }

  if (options.allow_network === false) {
    return applyIfixitFallback(brand, device_query);
  }

  try {
    const device_match = await lookupIfixitDeviceMatch(device_query);
    if (device_match.repairability_score === null && device_match.device_name === null) {
      return applyIfixitFallback(brand, device_query);
    }
    const entry = {
      repairability_score: device_match.repairability_score,
      repairability_scale: device_match.repairability_scale,
      device_name: device_match.device_name,
      device_url: device_match.device_url,
    };
    setIfixitCache(device_query, entry);
    writes.ifixit.push({
      brand,
      model_key,
      patch: {
        repairability_score: entry.repairability_score,
        repairability_scale: entry.repairability_scale,
        ifixit_device_name: entry.device_name,
        ifixit_url: entry.device_url,
      },
      cache_ttl_hours,
    });
    return {
      repairability_score: entry.repairability_score,
      repairability_scale: entry.repairability_scale,
      ifixit_device_name: entry.device_name,
      ifixit_url: entry.device_url,
      release_year: device_match.release_year,
    };
  } catch {
    return applyIfixitFallback(brand, device_query);
  }
}

function applyIfixitFallback(brand: string, device_query: string): {
  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;
  release_year: number | null;
} {
  const stub = getRepairabilityStub(brand);
  return {
    repairability_score: stub.repairability_score,
    repairability_scale: stub.repairability_scale,
    ifixit_device_name: null,
    ifixit_url: buildIfixitSearchStubUrl(device_query),
    release_year: null,
  };
}

// "Сырой" результат первой фазы анализа — всё, что можно посчитать по ОДНОМУ
// объявлению независимо от остальных (бренд/модель, повреждения, iFixit,
// найденные запчасти). market_sell_price/profitability/liquidity сюда
// намеренно не входят: их вторая фаза (finalizeDevices) считает по ВСЕМУ
// скану сразу (медиана цены по model_key), поэтому раньше их посчитать нельзя.
interface RawAnalyzedListing {
  id: number;
  title: string;
  olx_url: string;
  price_buy: number | null;
  price_currency: string | null;
  is_negotiable: boolean | null;
  brand: string;
  model_query: string;
  model_key: string;
  model_label: string;
  model_line: string;
  model_line_label: string;
  photos: string[];
  city: string | null;
  region: string | null;
  created_at: string;
  release_year: number | null;
  has_box: boolean;
  battery_health_percent: number | null;

  seller_name: string | null;
  seller_ads_count: number | null;
  seller_member_since: string | null;

  damage_types: string[];
  post_summary: string;

  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;

  allegro_parts: AllegroPart[];
  allegro_search_url: string | null;
}

async function analyzeSingleListing(
  listing: ParsedOlxListing,
  cache_ttl_hours: number,
  include_allegro: boolean,
  caches: ScanReadCaches,
  writes: ScanWriteBuffers,
  on_parts_source_error?: (source: string, message: string) => void,
  signal?: AbortSignal,
): Promise<RawAnalyzedListing | null> {
  if (signal?.aborted) {
    throw new Error("aborted");
  }
  const brand = extractBrand(listing.title);
  const { model_key, model_label } = extractModelKey(brand, listing.title);
  const { model_line, model_line_label } = extractModelLine(brand, model_key);
  let release_year = getReleaseYear(model_key);

  let damage_types: string[] = [];
  let post_summary = "";
  let device_query = listing.title;
  let has_box = false;
  let battery_health_percent: number | null = null;
  let seller_name: string | null = null;
  let seller_ads_count: number | null = null;
  let seller_member_since: string | null = null;

  try {
    const signals = await extractOlxListingSignals(listing, null, signal);
    damage_types = signals.damage_types;
    post_summary = signals.post_summary;
    device_query = signals.device_query || listing.title;
    has_box = signals.has_box;
    battery_health_percent = signals.battery_health_percent;
    seller_name = signals.seller_name;
    seller_ads_count = signals.seller_ads_count;
    seller_member_since = signals.seller_member_since;
  } catch (error) {
    if (signal?.aborted) throw error;
    // Если получить описание объявления не удалось — продолжаем с заголовком
    // и без повреждений (лучше проанализировать частично, чем упустить лот).
  }

  if (!post_summary.trim() && listing.description) {
    post_summary = listing.description;
  }
  if (!seller_name && listing.seller_name) {
    seller_name = listing.seller_name;
    seller_member_since = listing.seller_member_since ?? seller_member_since;
  }

  const storage_gb = extractStorageGb(`${listing.title} ${post_summary}`);

  // Поиск iFixit и поиск/оценка цен на запчасти не зависят друг от друга —
  // раньше шли строго последовательно (запчасти ждали iFixit впустую).
  const parts_damage_types = battery_health_percent !== null && !damage_types.includes("battery")
    ? [...damage_types, "battery"]
    : damage_types;

  const [ifixit_data, allegro_data] = await Promise.all([
    resolveIfixitDataForQuery(device_query, brand, model_key, cache_ttl_hours, caches, writes),
    fetchPartsData(
      brand,
      device_query,
      model_label,
      model_key,
      parts_damage_types,
      cache_ttl_hours,
      storage_gb,
      {
        include_allegro,
        signal,
        on_l2_write: (write) => writes.parts.push(write),
        on_source_error: (source, message) => {
          on_parts_source_error?.(source, message);
        },
      },
    ).catch(() => ({
      parts: buildStaticPartStubs(brand, device_query, model_label, parts_damage_types, storage_gb),
      search_url: null as string | null,
    })),
  ]);

  if (release_year === null && ifixit_data.release_year !== null) {
    release_year = ifixit_data.release_year;
  }

  return {
    id: listing.id,
    title: listing.title,
    olx_url: listing.url,
    price_buy: listing.price_value,
    price_currency: listing.price_currency,
    is_negotiable: listing.is_negotiable,
    brand,
    model_query: device_query,
    model_key,
    model_label,
    model_line,
    model_line_label,
    photos: listing.photos,
    city: listing.city,
    region: listing.region,
    created_at: listing.created_at,
    release_year,
    has_box,
    battery_health_percent,

    seller_name,
    seller_ads_count,
    seller_member_since,

    damage_types,
    post_summary,

    repairability_score: ifixit_data.repairability_score,
    repairability_scale: ifixit_data.repairability_scale,
    ifixit_device_name: ifixit_data.ifixit_device_name,
    ifixit_url: ifixit_data.ifixit_url,

    allegro_parts: allegro_data.parts,
    allegro_search_url: allegro_data.search_url,
  };
}

function analyzedDeviceToRaw(device: AnalyzedDevice): RawAnalyzedListing {
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
    photos: device.photos,
    city: device.city,
    region: device.region,
    created_at: device.created_at,
    release_year: device.release_year,
    has_box: device.has_box,
    battery_health_percent: device.battery_health_percent,
    seller_name: device.seller_name,
    seller_ads_count: device.seller_ads_count,
    seller_member_since: device.seller_member_since,
    damage_types: device.damage_types,
    post_summary: device.post_summary,
    repairability_score: device.repairability_score,
    repairability_scale: device.repairability_scale,
    ifixit_device_name: device.ifixit_device_name,
    ifixit_url: device.ifixit_url,
    allegro_parts: device.allegro_parts,
    allegro_search_url: device.allegro_search_url,
  };
}

function mergeIncomingListingIntoRaw(
  raw: RawAnalyzedListing,
  listing: ParsedOlxListing | undefined,
): RawAnalyzedListing {
  if (!listing) return raw;
  const description = listing.description?.trim() ?? "";
  const listing_text = `${listing.title} ${description}`;
  return {
    ...raw,
    photos: listing.photos.length > 0 ? listing.photos : raw.photos,
    post_summary: description || raw.post_summary,
    seller_name: listing.seller_name ?? raw.seller_name,
    seller_member_since: listing.seller_member_since ?? raw.seller_member_since,
    has_box: raw.has_box || detectHasBox(listing_text),
  };
}

async function analyzeListingLightweight(
  listing: ParsedOlxListing,
  cache_ttl_hours: number,
  caches: ScanReadCaches,
  writes: ScanWriteBuffers,
): Promise<RawAnalyzedListing> {
  const brand = extractBrand(listing.title);
  const { model_key, model_label } = extractModelKey(brand, listing.title);
  const { model_line, model_line_label } = extractModelLine(brand, model_key);
  const listing_text = `${listing.title} ${listing.description ?? ""}`;
  const damage_types = detectDamageTypesFromText(listing_text);
  const storage_gb = extractStorageGb(listing_text);
  const battery_health_percent = extractBatteryHealthPercent(listing_text);
  const ifixit_data = await resolveIfixitDataForQuery(
    listing.title,
    brand,
    model_key,
    cache_ttl_hours,
    caches,
    writes,
    { allow_network: false },
  );

  return {
    id: listing.id,
    title: listing.title,
    olx_url: listing.url,
    price_buy: listing.price_value,
    price_currency: listing.price_currency,
    is_negotiable: listing.is_negotiable,
    brand,
    model_query: listing.title,
    model_key,
    model_label,
    model_line,
    model_line_label,
    photos: listing.photos,
    city: listing.city,
    region: listing.region,
    created_at: listing.created_at,
    release_year: getReleaseYear(model_key) ?? ifixit_data.release_year,
    has_box: detectHasBox(listing_text),
    battery_health_percent,
    seller_name: listing.seller_name ?? null,
    seller_ads_count: null,
    seller_member_since: listing.seller_member_since ?? null,
    damage_types,
    post_summary: listing.description ?? "",
    repairability_score: ifixit_data.repairability_score,
    repairability_scale: ifixit_data.repairability_scale,
    ifixit_device_name: ifixit_data.ifixit_device_name,
    ifixit_url: ifixit_data.ifixit_url,
    allegro_parts: buildStaticPartStubs(brand, listing.title, model_label, damage_types, storage_gb),
    allegro_search_url: null,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Медиана цены исправных объявлений по model_key и (если известен) объёму памяти.
 */
interface MedianPriceMaps {
  by_model_storage: Map<string, number>;
  by_model: Map<string, number>;
  sample_count_by_storage_key: Map<string, number>;
  sample_count_by_model: Map<string, number>;
}

function buildMedianPriceMaps(listings: RawAnalyzedListing[]): MedianPriceMaps {
  const prices_by_model_storage = new Map<string, number[]>();
  const prices_by_model = new Map<string, number[]>();

  for (const listing of listings) {
    if (listing.damage_types.length > 0) continue;
    if (!listing.price_buy || listing.price_buy <= 0) continue;

    const storage_gb = extractStorageGb(`${listing.title} ${listing.post_summary}`);
    const model_prices = prices_by_model.get(listing.model_key) ?? [];
    model_prices.push(listing.price_buy);
    prices_by_model.set(listing.model_key, model_prices);

    if (storage_gb !== null) {
      const storage_key = `${listing.model_key}::${storage_gb}`;
      const storage_prices = prices_by_model_storage.get(storage_key) ?? [];
      storage_prices.push(listing.price_buy);
      prices_by_model_storage.set(storage_key, storage_prices);
    }
  }

  const by_model_storage = new Map<string, number>();
  const sample_count_by_storage_key = new Map<string, number>();
  for (const [storage_key, prices] of prices_by_model_storage) {
    if (prices.length < MIN_COMPARABLE_LISTINGS_FOR_MEDIAN) continue;
    by_model_storage.set(storage_key, median(prices));
    sample_count_by_storage_key.set(storage_key, prices.length);
  }

  const by_model = new Map<string, number>();
  const sample_count_by_model = new Map<string, number>();
  for (const [model_key, prices] of prices_by_model) {
    if (prices.length < MIN_COMPARABLE_LISTINGS_FOR_MEDIAN) continue;
    by_model.set(model_key, median(prices));
    sample_count_by_model.set(model_key, prices.length);
  }

  return {
    by_model_storage,
    by_model,
    sample_count_by_storage_key,
    sample_count_by_model,
  };
}

/** Точная медиана по model_key+storage_gb или пересчёт смешанной медианы модели. */
function resolveMedianPrice(
  median_maps: MedianPriceMaps,
  model_key: string,
  storage_gb: number | null,
): number | null {
  if (storage_gb !== null) {
    const exact_median = median_maps.by_model_storage.get(`${model_key}::${storage_gb}`);
    if (exact_median !== undefined) return exact_median;
  }

  const model_median = median_maps.by_model.get(model_key);
  if (model_median === undefined) return null;
  if (storage_gb === null) return model_median;

  return Math.round(
    model_median * getStorageMultiplier(storage_gb) / getStorageMultiplier(MARKET_REFERENCE_STORAGE_GB),
  );
}

function resolveMedianSampleCount(
  median_maps: MedianPriceMaps,
  model_key: string,
  storage_gb: number | null,
): number | null {
  if (storage_gb !== null) {
    const storage_key = `${model_key}::${storage_gb}`;
    const storage_count = median_maps.sample_count_by_storage_key.get(storage_key);
    if (storage_count !== undefined) return storage_count;
  }
  return median_maps.sample_count_by_model.get(model_key) ?? null;
}

interface FinalizeDeviceContext {
  median_maps: MedianPriceMaps;
  cached_price_by_composite_key: Map<string, number>;
  catalog_by_composite_key: Map<string, CatalogMarketPriceSnapshot>;
  kimovil_by_composite_key: Map<string, { geek_score: number | null; user_score: number | null }>;
}

function buildFinalizedDevice(raw: RawAnalyzedListing, ctx: FinalizeDeviceContext): AnalyzedDevice {
  const { median_maps, cached_price_by_composite_key, catalog_by_composite_key, kimovil_by_composite_key } = ctx;
  const is_damaged = raw.damage_types.length > 0;
  const storage_gb = extractStorageGb(`${raw.title} ${raw.post_summary}`);
  const model_hint_price = getModelMarketPrice(raw.model_key, storage_gb);
  const catalog_snapshot = catalog_by_composite_key.get(`${raw.brand}::${raw.model_key}`) ?? null;
  const catalog_anchor = resolveCatalogSellPrice(catalog_snapshot, storage_gb);

  const median_price = resolveMedianPrice(median_maps, raw.model_key, storage_gb);
  const cached_median_price = median_price === null
    ? cached_price_by_composite_key.get(`${raw.brand}::${raw.model_key}`) ?? null
    : null;
  const cached_median_adjusted = cached_median_price !== null && storage_gb !== null
    ? Math.round(
      cached_median_price * getStorageMultiplier(storage_gb) / getStorageMultiplier(MARKET_REFERENCE_STORAGE_GB),
    )
    : cached_median_price;
  const anchor_price = median_price ?? catalog_anchor ?? model_hint_price ?? cached_median_adjusted;

  let market_sell_price: number | null;
  let market_sell_price_source: "model_median" | "cached_median" | "model_hint" | "brand_estimate" | null;

  if (is_damaged) {
    const parts_cost_preview = estimatePartsCost(raw.allegro_parts);
    const working_anchor = anchor_price ?? model_hint_price;

    if (working_anchor !== null) {
      market_sell_price = estimateDamagedResalePrice(
        working_anchor,
        raw.damage_types,
        raw.price_buy,
        parts_cost_preview,
      );
      market_sell_price_source = median_price !== null
        ? "model_median"
        : catalog_anchor !== null
          ? (catalog_snapshot?.market_sell_price_source as typeof market_sell_price_source) ?? "model_hint"
          : model_hint_price !== null
            ? "model_hint"
            : cached_median_adjusted !== null
              ? "cached_median"
              : "brand_estimate";
    } else {
      market_sell_price = estimateMarketSellPrice(
        raw.brand,
        raw.model_key,
        raw.price_buy,
        true,
        storage_gb,
        raw.damage_types,
        parts_cost_preview,
      );
      market_sell_price_source = market_sell_price === null
        ? null
        : model_hint_price !== null
          ? "model_hint"
          : "brand_estimate";
    }
  } else if (anchor_price !== null) {
    market_sell_price = Math.round(
      anchor_price * (raw.has_box ? 1 + BOX_AND_ACCESSORIES_BONUS_SCORE / 100 : 1),
    );
    market_sell_price_source = median_price !== null
      ? "model_median"
      : catalog_anchor !== null
        ? (catalog_snapshot?.market_sell_price_source as typeof market_sell_price_source) ?? "model_hint"
        : model_hint_price !== null
          ? "model_hint"
          : cached_median_adjusted !== null
            ? "cached_median"
            : "brand_estimate";
  } else {
    market_sell_price = estimateMarketSellPrice(
      raw.brand,
      raw.model_key,
      raw.price_buy,
      false,
      storage_gb,
    );
    market_sell_price_source = market_sell_price === null
      ? null
      : model_hint_price !== null
        ? "model_hint"
        : "brand_estimate";
  }

  const kimovil = kimovil_by_composite_key.get(`${raw.brand}::${raw.model_key}`);
  const liquidity_data = getLiquidityScore({
    brand: raw.brand,
    model_query: raw.model_query,
    model_key: raw.model_key,
    release_year: raw.release_year,
    has_box: raw.has_box,
    battery_health_percent: raw.battery_health_percent,
    storage_gb,
    market_median_price: anchor_price,
    damage_types: raw.damage_types,
    geek_score: kimovil?.geek_score,
    user_score: kimovil?.user_score,
  });

  const profitability = computeDeviceAnalytics({
    price_buy: raw.price_buy,
    is_negotiable: raw.is_negotiable,
    parts: raw.allegro_parts,
    market_sell_price,
    market_sell_price_source,
    repairability_score: raw.repairability_score,
    repairability_scale: raw.repairability_scale,
    manual_repair_complexity_pct: catalog_snapshot?.manual_repair_complexity_pct ?? null,
    liquidity_score: liquidity_data.liquidity_score,
    median_sample_count: market_sell_price_source === "model_median"
      ? resolveMedianSampleCount(median_maps, raw.model_key, storage_gb)
      : null,
  });

  return {
    id: raw.id,
    title: raw.title,
    olx_url: raw.olx_url,
    price_buy: raw.price_buy,
    price_currency: raw.price_currency,
    is_negotiable: raw.is_negotiable,
    brand: raw.brand,
    model_query: raw.model_query,
    model_key: raw.model_key,
    model_label: raw.model_label,
    model_line: raw.model_line,
    model_line_label: raw.model_line_label,
    photos: raw.photos,
    city: raw.city,
    region: raw.region,
    created_at: raw.created_at,
    release_year: raw.release_year,
    has_box: raw.has_box,
    battery_health_percent: raw.battery_health_percent,
    storage_gb,

    seller_name: raw.seller_name,
    seller_ads_count: raw.seller_ads_count,
    seller_member_since: raw.seller_member_since,

    damage_types: raw.damage_types,
    post_summary: raw.post_summary,

    repairability_score: raw.repairability_score,
    repairability_scale: raw.repairability_scale,
    ifixit_device_name: raw.ifixit_device_name,
    ifixit_url: raw.ifixit_url,

    allegro_parts: raw.allegro_parts,
    allegro_search_url: raw.allegro_search_url,
    ...profitability,

    market_sell_price,
    market_sell_price_source,
    ...liquidity_data,

    last_analyzed_at: new Date().toISOString(),
  };
}

const FINALIZE_PROGRESS_BATCH = 40;

/**
 * Вторая фаза: считает market_sell_price/profitability/liquidity сразу для
 * всех объявлений скана, потому что медиана цены модели требует видеть ВСЕ
 * объявления той же модели одновременно — раньше эта же цена оценивалась
 * циклически из buy_price ОДНОГО объявления (см. план/TODO.md).
 *
 * Запись медиан в ModelCache и сетевой prefetch OLX здесь не ждутся —
 * они уходят в scan-jobs после сохранения ленты, иначе стадия finalizing
 * стоит на SQLite upsert и запросах OLX по каждой модели без своей выборки.
 */
async function finalizeDevices(
  raw_listings: RawAnalyzedListing[],
  caches: ScanReadCaches,
  on_progress?: (processed: number, total: number) => void,
): Promise<{
  devices: AnalyzedDevice[];
  fresh_medians: ModelMedianCacheItem[];
  olx_market_prefetch: Array<{ brand: string; model_key: string; model_label: string; count: number }>;
}> {
  const finalize_started_at = Date.now();
  const total = raw_listings.length;
  on_progress?.(0, total);

  // Дедуп model_key ПЕРЕД медианой — иначе разные варианты написания одной и
  // той же модели (регистр/пробелы/опечатки) считались бы отдельными группами
  // и портили и медиану цены, и чекбокс-фильтр моделей на фронтенде (см.
  // model-key-clusterer.ts).
  const canonical_by_raw_key = clusterModelKeys(
    raw_listings.map((raw) => ({ model_key: raw.model_key, model_label: raw.model_label })),
  );
  for (const raw of raw_listings) {
    const canonical = canonical_by_raw_key.get(raw.model_key);
    if (canonical) {
      raw.model_key = canonical.model_key;
      raw.model_label = canonical.model_label;
    }
  }

  const median_maps = buildMedianPriceMaps(raw_listings);

  // Для моделей БЕЗ достаточно сравнимых объявлений в ЭТОМ скане — пробуем
  // промежуточный третий уровень: кросс-скановый "якорь" цены (avg_market_price
  // в ModelCache), обновлённый одним из предыдущих сканов. Только если и его
  // нет — грубый brand_estimate. Отдельная Map, а не await на каждое
  // устройство внутри .map(), чтобы не бить одну и ту же (brand, model_key)
  // пару в БД по несколько раз.
  const model_keys_needing_cache_lookup = new Set<string>();
  for (const raw of raw_listings) {
    const storage_gb = extractStorageGb(`${raw.title} ${raw.post_summary}`);
    if (resolveMedianPrice(median_maps, raw.model_key, storage_gb) === null) {
      model_keys_needing_cache_lookup.add(`${raw.brand}::${raw.model_key}`);
    }
  }
  const cached_price_by_composite_key = new Map<string, number>();
  const catalog_by_composite_key = new Map<string, CatalogMarketPriceSnapshot>();
  const all_composite_keys = new Set(
    raw_listings.map((raw) => `${raw.brand}::${raw.model_key}`),
  );

  for (const composite_key of model_keys_needing_cache_lookup) {
    const cached = caches.model_cache.get(composite_key);
    if (cached?.avg_market_price) {
      cached_price_by_composite_key.set(composite_key, cached.avg_market_price);
    }
  }

  for (const composite_key of all_composite_keys) {
    const [brand, model_key] = composite_key.split("::");
    const catalog = caches.catalog.getMarketPrice(brand, model_key);
    if (catalog) {
      catalog_by_composite_key.set(composite_key, catalog);
    }
  }

  const kimovil_by_composite_key = new Map<string, { geek_score: number | null; user_score: number | null }>();
  for (const composite_key of all_composite_keys) {
    const cached = caches.model_cache.get(composite_key);
    if (
      cached
      && (cached.kimovil_geek_score != null || cached.kimovil_user_score != null || cached.kimovil_combined_score != null)
    ) {
      kimovil_by_composite_key.set(composite_key, {
        geek_score: cached.kimovil_geek_score ?? null,
        user_score: cached.kimovil_user_score ?? null,
      });
    }
  }

  const models_still_missing_price: Array<{
    brand: string;
    model_key: string;
    model_label: string;
    count: number;
  }> = [];
  const missing_counts = new Map<string, {
    brand: string;
    model_key: string;
    model_label: string;
    count: number;
  }>();
  for (const raw of raw_listings) {
    const storage_gb = extractStorageGb(`${raw.title} ${raw.post_summary}`);
    if (resolveMedianPrice(median_maps, raw.model_key, storage_gb) !== null) continue;
    const composite_key = `${raw.brand}::${raw.model_key}`;
    if (cached_price_by_composite_key.has(composite_key)) continue;
    const existing = missing_counts.get(composite_key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    missing_counts.set(composite_key, {
      brand: raw.brand,
      model_key: raw.model_key,
      model_label: raw.model_label,
      count: 1,
    });
  }
  models_still_missing_price.push(...missing_counts.values());

  pipeline_log.info("Finalizing: подготовка медиан", {
    devices: total,
    cache_lookups: model_keys_needing_cache_lookup.size,
    olx_prefetch_deferred: models_still_missing_price.length,
  });

  const finalize_ctx: FinalizeDeviceContext = {
    median_maps,
    cached_price_by_composite_key,
    catalog_by_composite_key,
    kimovil_by_composite_key,
  };
  const finalized: AnalyzedDevice[] = [];
  for (let i = 0; i < raw_listings.length; i += 1) {
    finalized.push(buildFinalizedDevice(raw_listings[i], finalize_ctx));
    const processed = i + 1;
    if (
      processed === total
      || processed % FINALIZE_PROGRESS_BATCH === 0
    ) {
      on_progress?.(processed, total);
    }
  }

  const fresh_medians: ModelMedianCacheItem[] = [];
  const seen_median_keys = new Set<string>();
  for (const raw of raw_listings) {
    const composite_key = `${raw.brand}::${raw.model_key}`;
    if (seen_median_keys.has(composite_key)) continue;
    const model_median = median_maps.by_model.get(raw.model_key);
    if (model_median === undefined) continue;
    seen_median_keys.add(composite_key);
    fresh_medians.push({
      brand: raw.brand,
      model_key: raw.model_key,
      avg_market_price: model_median,
    });
  }

  on_progress?.(total, total);
  pipeline_log.info("Finalizing завершён", {
    devices: total,
    duration: formatDuration(Date.now() - finalize_started_at),
    median_models_deferred: fresh_medians.length,
  });

  return {
    devices: finalized.sort((a, b) => (b.profitability_pct ?? -999) - (a.profitability_pct ?? -999)),
    fresh_medians,
    olx_market_prefetch: models_still_missing_price,
  };
}

export interface PipelineProgress {
  stage: "fetching_listings" | "analyzing" | "finalizing";
  total_listings?: number;
  processed_listings?: number;
}

export interface FullPipelineResult {
  devices: AnalyzedDevice[];
  fresh_medians: ModelMedianCacheItem[];
  olx_market_prefetch: Array<{ brand: string; model_key: string; model_label: string; count: number }>;
  cache_ttl_hours: number;
  outcome: ScanPipelineOutcome;
  ifixit_cache_writes: IfixitCacheWrite[];
  parts_cache_writes: PartsCacheWrite[];
}

function emptyPipelineResult(
  cache_ttl_hours: number,
  outcome: ScanPipelineOutcome,
  writes: ScanWriteBuffers,
): FullPipelineResult {
  return {
    devices: [],
    fresh_medians: [],
    olx_market_prefetch: [],
    cache_ttl_hours,
    outcome,
    ifixit_cache_writes: writes.ifixit,
    parts_cache_writes: writes.parts,
  };
}

export async function runFullPipeline(
  on_progress?: (progress: PipelineProgress) => void,
  issue_collector?: ScanIssueCollector,
): Promise<FullPipelineResult> {
  const pipeline_started_at = Date.now();
  pipeline_log.info("Старт пайплайна");
  on_progress?.({ stage: "fetching_listings", processed_listings: 0 });

  const fetch_started_at = Date.now();
  const fetch_result = await fetchOlxListingsForStates({
    states: config.pipeline.olx_state_filters,
    max_pages: config.pipeline.olx_max_pages,
    limit: config.pipeline.olx_page_limit,
    on_fetch_page: (pages_done, pages_total) => {
      on_progress?.({
        stage: "fetching_listings",
        total_listings: pages_total,
        processed_listings: pages_done,
      });
    },
  });
  const listings = fetch_result.items;
  const fetch_partial = fetch_result.issues.length > 0;
  for (const issue of fetch_result.issues) {
    issue_collector?.record({
      severity: issue.severity,
      kind: issue.kind,
      message: issue.state_filter
        ? `${issue.state_filter}: ${issue.message}`
        : issue.message,
    });
  }
  pipeline_log.info("OLX: объявления загружены", {
    count: listings.length,
    fetch_partial,
    states_ok: fetch_result.states_ok,
    states_failed: fetch_result.states_failed,
    duration: formatDuration(Date.now() - fetch_started_at),
  });

  const fingerprints = await getLatestDeviceFingerprints();
  const previous_count = fingerprints.length;
  const app_settings = await getAppSettings();
  const cache_ttl_hours = app_settings.cache_ttl_hours;
  const include_allegro = app_settings.allegro_parts_auto_enabled;
  const writes: ScanWriteBuffers = { ifixit: [], parts: [] };

  const fetch_error_message = fetch_result.issues[0]
    ? fetch_result.issues.map((issue) => issue.message).slice(0, 3).join("; ")
    : null;

  if (!shouldReplaceFeed(listings.length, previous_count)) {
    const outcome = resolveScanOutcome({
      stats: {
        listings_fetched: listings.length,
        previous_count,
        reused: 0,
        full: 0,
        lightweight: 0,
        lightweight_fallback: 0,
        skipped: 0,
        fetch_partial,
      },
      fetch_error_message,
    });
    issue_collector?.recordError({
      kind: "feed_not_replaced",
      message: outcome.message ?? "Лента не заменена",
    });
    pipeline_log.warn("Пайплайн остановил замену ленты", {
      listings: listings.length,
      previous_count,
      message: outcome.message,
    });
    return emptyPipelineResult(cache_ttl_hours, outcome, writes);
  }

  on_progress?.({ stage: "analyzing", total_listings: listings.length, processed_listings: 0 });

  const [catalog, model_cache] = await Promise.all([
    loadCatalogLookup(),
    listFreshModelCaches(),
  ]);
  const caches: ScanReadCaches = { catalog, model_cache };

  const previous_by_id = new Map<number, AnalyzedDevice>();
  const fingerprint_map = config.pipeline.delta_scan_enabled
    ? new Map(fingerprints.map((item) => [item.id, item]))
    : new Map<number, { id: number; title: string; price_buy: number | null }>();
  const delta = partitionDeltaScan(
    listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      price_buy: listing.price_value,
    })),
    fingerprint_map,
  );

  if (config.pipeline.delta_scan_enabled && delta.unchanged_ids.length > 0) {
    const reused_devices = await getDevicesByIds(delta.unchanged_ids);
    for (const device of reused_devices) {
      previous_by_id.set(device.id, device);
    }
  }

  const analyze_ids = new Set(idsNeedingAnalysis(delta));
  const listings_to_score = listings.filter((listing) => analyze_ids.has(listing.id));
  const candidates = listings_to_score.map((listing) => scoreListingCandidate({
    id: listing.id,
    title: listing.title,
    price_buy: listing.price_value,
  }));
  const selection = selectListingsForFullAnalysis(candidates, {
    enabled: config.pipeline.two_phase_enabled,
    full_analyze_limit: config.pipeline.two_phase_full_analyze_limit,
    min_profit_pln: config.pipeline.two_phase_min_profit_pln,
  });
  const full_id_set = new Set(selection.full_ids);
  const light_id_set = new Set(selection.lightweight_ids);
  const full_listings = listings.filter((listing) => full_id_set.has(listing.id));
  const light_listings = listings.filter((listing) => light_id_set.has(listing.id));
  const listings_by_id = new Map(listings.map((listing) => [listing.id, listing]));
  const reused_raw = delta.unchanged_ids
    .map((id) => {
      const device = previous_by_id.get(id);
      if (!device) return null;
      return mergeIncomingListingIntoRaw(analyzedDeviceToRaw(device), listings_by_id.get(id));
    })
    .filter((raw): raw is RawAnalyzedListing => Boolean(raw));

  pipeline_log.info("Delta/two-phase отбор", {
    incoming: listings.length,
    reused: reused_raw.length,
    full: full_listings.length,
    lightweight: light_listings.length,
    dropped: delta.dropped_ids.length,
  });

  let processed_count = reused_raw.length;
  let skipped_count = 0;
  let lightweight_fallback_count = 0;
  const analyze_started_at = Date.now();
  const listing_timeout_ms = config.pipeline.listing_analyze_timeout_ms;
  on_progress?.({
    stage: "analyzing",
    total_listings: listings.length,
    processed_listings: processed_count,
  });

  const tickProgress = () => {
    processed_count += 1;
    on_progress?.({
      stage: "analyzing",
      total_listings: listings.length,
      processed_listings: processed_count,
    });
  };

  const catchListingError = (listing: ParsedOlxListing, error: unknown): null => {
    skipped_count += 1;
    const reason = error instanceof Error ? error.message : String(error);
    pipeline_log.warn("Пропуск объявления", {
      listing_id: listing.id,
      reason,
    });
    issue_collector?.recordError({
      listing_id: listing.id,
      olx_url: listing.url,
      title: listing.title,
      kind: classifyListingError(reason),
      message: reason,
    });
    return null;
  };

  const seen_part_failures = new Set<string>();
  const recordPartsSourceError = (source: string, message: string) => {
    if (seen_part_failures.has(source)) return;
    seen_part_failures.add(source);
    issue_collector?.recordWarning({
      kind: "parts_source_failed",
      message: `${source}: ${message}`,
    });
  };

  const analyzeFullWithFallback = async (listing: ParsedOlxListing): Promise<RawAnalyzedListing | null> => {
    const controller = new AbortController();
    try {
      const full = await withTimeout(
        analyzeSingleListing(
          listing,
          cache_ttl_hours,
          include_allegro,
          caches,
          writes,
          recordPartsSourceError,
          controller.signal,
        ),
        listing_timeout_ms,
        `listing ${listing.id}`,
        controller,
      );
      if (full) return full;
    } catch (error) {
      pipeline_log.warn("Полный анализ не удался, lightweight fallback", {
        listing_id: listing.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const light = await withTimeout(
        analyzeListingLightweight(listing, cache_ttl_hours, caches, writes),
        Math.min(listing_timeout_ms, 15_000),
        `listing-light-fallback ${listing.id}`,
      );
      lightweight_fallback_count += 1;
      issue_collector?.recordWarning({
        listing_id: listing.id,
        olx_url: listing.url,
        title: listing.title,
        kind: "degraded_to_lightweight",
        message: "Полный анализ не удался, использован упрощённый разбор",
      });
      return light;
    } catch (error) {
      return catchListingError(listing, error);
    }
  };

  const full_results = await runWithConcurrency(
    full_listings,
    config.pipeline.concurrency,
    analyzeFullWithFallback,
    tickProgress,
  );

  const light_results = await runWithConcurrency(
    light_listings,
    config.pipeline.concurrency,
    (listing) => withTimeout(
      analyzeListingLightweight(listing, cache_ttl_hours, caches, writes),
      Math.min(listing_timeout_ms, 15_000),
      `listing-light ${listing.id}`,
    ).catch((error) => catchListingError(listing, error)),
    tickProgress,
  );

  const raw_listings = [
    ...reused_raw,
    ...full_results.filter((raw): raw is RawAnalyzedListing => raw != null),
    ...light_results.filter((raw): raw is RawAnalyzedListing => raw != null),
  ];

  const rejected_count = listings.length - raw_listings.length;
  pipeline_log.info("Анализ объявлений завершён", {
    total: listings.length,
    accepted: raw_listings.length,
    reused: reused_raw.length,
    full: full_results.filter(Boolean).length,
    lightweight: light_results.filter(Boolean).length,
    lightweight_fallback: lightweight_fallback_count,
    rejected: rejected_count,
    errors_or_timeouts: skipped_count,
    duration: formatDuration(Date.now() - analyze_started_at),
  });

  on_progress?.({ stage: "finalizing", total_listings: raw_listings.length, processed_listings: 0 });

  const finalized = await finalizeDevices(raw_listings, caches, (processed, total) => {
    on_progress?.({ stage: "finalizing", total_listings: total, processed_listings: processed });
  });
  const devices = finalized.devices;

  if (issue_collector) {
    for (const device of devices) {
      for (const warning of detectDeviceWarnings(device)) {
        issue_collector.record(warning);
      }
    }
  }

  const outcome = resolveScanOutcome({
    stats: {
      listings_fetched: listings.length,
      previous_count,
      reused: reused_raw.length,
      full: full_results.filter(Boolean).length,
      lightweight: light_results.filter(Boolean).length,
      lightweight_fallback: lightweight_fallback_count,
      skipped: skipped_count,
      fetch_partial,
    },
    fetch_error_message,
  });

  pipeline_log.info("Пайплайн завершён", {
    devices: devices.length,
    outcome: outcome.status,
    duration: formatDuration(Date.now() - pipeline_started_at),
  });

  return {
    devices,
    fresh_medians: finalized.fresh_medians,
    olx_market_prefetch: finalized.olx_market_prefetch,
    cache_ttl_hours,
    outcome,
    ifixit_cache_writes: writes.ifixit,
    parts_cache_writes: writes.parts,
  };
}
