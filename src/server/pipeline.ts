import { fetchOlxListingsForStates, type ParsedOlxListing } from "./olx-fetcher/fetcher";
import { extractOlxListingSignals, lookupIfixitDeviceMatch } from "./olx-fetcher/fix-parser";
import { LiquidityCalculator } from "./liquidity-calculator/calculator";
import { OLX_2026_MARKET_SNAPSHOT_BY_BRAND, BOX_AND_ACCESSORIES_BONUS_SCORE } from "./liquidity-calculator/constants";
import { getReleaseYear } from "./liquidity-calculator/release-year-hints";
import { config } from "./config";
import {
  getIfixitCache, setIfixitCache,
  getAllegroCache, setAllegroCache,
} from "./cache";
import { estimateDamagedResalePrice, estimateMarketSellPrice, extractBrand } from "./brand-extractor";
import { extractStorageGb, getModelMarketPrice, getStorageMultiplier, MARKET_REFERENCE_STORAGE_GB } from "./model-market-price-hints";
import { extractModelKey } from "./model-normalizer";
import { extractModelLine } from "./model-line-extractor";
import { clusterModelKeys } from "./model-key-clusterer";
import { evaluateJunkStatus, type JunkFilterSettings } from "./junk-filter";
import { isPlatformExcluded, type PlatformFilterSettings } from "./platform-filter";
import { calculateProfitability, estimatePartsCost } from "./profitability";
import { getStaticPartsEstimate, buildAllegroSearchUrl, PART_SEARCH_KEYWORDS } from "./static-parts-prices";
import { fetchCeneoParts } from "./ceneo-fetcher";
import { fetchOlxParts, buildOlxPartsSearchUrl } from "./olx-parts-fetcher";
import {
  getAppSettings,
  getModelCache, upsertModelCache,
  getPartsCostCache, upsertPartsCostCache,
} from "./devices-repository";
import type { AnalyzedDevice, AllegroPart } from "./types";

const liquidity_calculator = new LiquidityCalculator();

// Используется как release_year, когда справочник release-year-hints.ts не
// знает конкретную модель — тот же дефолт, который раньше был жёстко
// прописан для ВСЕХ устройств (см. TODO.md про известное ограничение
// эвристики года выпуска).
const FALLBACK_RELEASE_YEAR = 2022;

// Минимум сравнимых необорудованных повреждениями объявлений той же модели
// в ЭТОМ скане, при котором медиана считается статистически осмысленной —
// иначе (0 или 1 объявление) откатываемся на старую формулу-эвристику от
// бренда, чтобы не строить "медиану" по единичному выбросу.
const MIN_COMPARABLE_LISTINGS_FOR_MEDIAN = 2;

/**
 * Пул воркеров со скользящим окном конкурентности: как только один воркер
 * освобождается, он сразу берёт следующий элемент — в отличие от прежней
 * реализации "фиксированными батчами" (ждать весь батч из N элементов, даже
 * если один "тяжёлый" элемент держит остальные пустые слоты батча вхолостую).
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  on_item_done?: () => void,
): Promise<R[]> {
  const results: R[] = [];
  let next_index = 0;

  async function worker(): Promise<void> {
    while (next_index < items.length) {
      const current_index = next_index;
      next_index += 1;
      try {
        results.push(await fn(items[current_index]));
      } catch {
        // Ошибка по одному объявлению не должна останавливать остальные —
        // раньше эту же гарантию давал Promise.allSettled.
      } finally {
        on_item_done?.();
      }
    }
  }

  const worker_count = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: worker_count }, () => worker()));
  return results;
}

// Цепочка источников цен на запчасти, на каждый damage_type отдельно (не
// all-or-nothing): если по конкретному типу повреждения ничего не нашлось у
// одного источника — пробуем следующий, а не отбрасываем то, что уже нашли
// по другим типам.
//   1. OLX ("Części do telefonów") — основной источник: тот же сайт, что и
//      объявления с телефонами, никакой анти-бот защиты не встречено.
//   2. Ceneo.pl — вторичная попытка (иногда отдаёт реальные данные, иногда
//      анти-бот заглушку — см. TODO.md).
//   3. Статические ориентировочные цены (★) — финальный fallback.
// Allegro REST API (/offers/listing) недоступен даже с валидными
// client_credentials — приложение требует ручной верификации, которую
// Allegro сейчас не выдаёт новым приложениям (проверено живым запросом).
async function fetchPartsForDamageType(
  brand: string,
  model_short: string,
  model_query: string,
  damage_type: string,
): Promise<AllegroPart[]> {
  const keyword = PART_SEARCH_KEYWORDS[damage_type];
  if (!keyword) return [];

  const olx_result = await fetchOlxParts(
    brand,
    model_short,
    damage_type,
    keyword,
    config.pipeline.allegro_parts_per_model,
  );
  if (olx_result.parts.length > 0) {
    return olx_result.parts.map((p) => ({ ...p, damage_type }));
  }

  const ceneo_result = await fetchCeneoParts(
    brand,
    model_short,
    damage_type,
    keyword,
    config.pipeline.allegro_parts_per_model,
  );
  if (ceneo_result.parts.length > 0) {
    return ceneo_result.parts.map((p) => ({ ...p, damage_type }));
  }

  const static_estimates = getStaticPartsEstimate(brand, model_query, [damage_type]);
  return static_estimates.map((est) => ({
    title: `${est.part_name} ★ szacunkowa cena`,
    price: est.price_estimate,
    currency: "PLN",
    url: buildOlxPartsSearchUrl(est.allegro_search_query),
    image: null,
    damage_type: est.damage_type,
  }));
}

function buildDamageSignature(damage_types: string[]): string {
  return [...damage_types].sort().join(",");
}

async function fetchPartsData(
  brand: string,
  model_query: string,
  model_key: string,
  damage_types: string[],
  cache_ttl_hours: number,
): Promise<{
  parts: AllegroPart[];
  search_url: string | null;
}> {
  const cached = getAllegroCache(brand, model_query, damage_types);
  if (cached) {
    return { parts: cached.parts, search_url: cached.search_url };
  }

  const damage_signature = buildDamageSignature(damage_types);
  // L2 (БД, переживает рестарт) — проверяем ПОСЛЕ in-memory L1, но ДО сети.
  // model_key (канонический ключ, а не почти-случайный model_short) — общий
  // для всех объявлений одной модели, поэтому кеш реально переиспользуется
  // между разными объявлениями/сканами, а не только внутри одного процесса.
  const db_cached = await getPartsCostCache(brand, model_key, damage_signature);
  if (db_cached) {
    setAllegroCache(brand, model_query, damage_types, db_cached);
    return db_cached;
  }

  const fallback_search_url = buildAllegroSearchUrl(brand, model_query, damage_types);

  if (damage_types.length === 0) {
    const empty_entry = { parts: [], search_url: fallback_search_url };
    setAllegroCache(brand, model_query, damage_types, empty_entry);
    return empty_entry;
  }

  const model_short = model_query.split(" ").slice(0, 3).join(" ");

  // Типы повреждений одного объявления независимы друг от друга — раньше
  // запросы шли строго последовательно (экран -> ждать -> батарея -> ждать...),
  // хотя единственное реальное ограничение скорости — общие лимитеры на
  // уровне источника (olx-parts-fetcher.ts/ceneo-fetcher.ts), а не порядок
  // самих вызовов.
  const results_by_type = await Promise.all(
    damage_types.map((damage_type) => fetchPartsForDamageType(brand, model_short, model_query, damage_type)),
  );
  const parts: AllegroPart[] = results_by_type.flat();

  const entry = { parts, search_url: fallback_search_url };
  setAllegroCache(brand, model_query, damage_types, entry);
  void upsertPartsCostCache(brand, model_key, damage_signature, entry, cache_ttl_hours);
  return entry;
}

interface LiquidityScoreParams {
  brand: string;
  model_query: string;
  release_year: number | null;
  has_box: boolean;
  battery_health_percent: number | null;
  storage_gb: number | null;
  market_median_price: number | null;
  damage_types: string[];
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
      release_year: params.release_year ?? FALLBACK_RELEASE_YEAR,
      condition_score: computeConditionScore(params.damage_types, params.battery_health_percent),
      storage_gb: params.storage_gb ?? MARKET_REFERENCE_STORAGE_GB,
      has_box_and_accessories: params.has_box,
      battery_health_percent: params.battery_health_percent ?? undefined,
      market_median_price: params.market_median_price ?? undefined,
      monthly_sales_count: snapshot?.monthly_sales_count,
      active_listings_count: snapshot?.active_listings_count,
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

  // L2 (БД) — ремонтопригодность не зависит от конкретного объявления, только
  // от модели устройства, поэтому переиспользуется между сканами и между
  // разными объявлениями той же модели в рамках одного скана.
  const db_cached = await getModelCache(brand, model_key);
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

  try {
    const device_match = await lookupIfixitDeviceMatch(device_query);
    const entry = {
      repairability_score: device_match.repairability_score,
      repairability_scale: device_match.repairability_scale,
      device_name: device_match.device_name,
      device_url: device_match.device_url,
    };
    setIfixitCache(device_query, entry);
    void upsertModelCache(brand, model_key, {
      repairability_score: entry.repairability_score,
      repairability_scale: entry.repairability_scale,
      ifixit_device_name: entry.device_name,
      ifixit_url: entry.device_url,
    }, cache_ttl_hours);
    return {
      repairability_score: entry.repairability_score,
      repairability_scale: entry.repairability_scale,
      ifixit_device_name: entry.device_name,
      ifixit_url: entry.device_url,
      release_year: device_match.release_year,
    };
  } catch {
    return {
      repairability_score: null,
      repairability_scale: null,
      ifixit_device_name: null,
      ifixit_url: null,
      release_year: null,
    };
  }
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
  battery_threshold_percent: number,
  junk_settings: JunkFilterSettings,
  platform_settings: PlatformFilterSettings,
  cache_ttl_hours: number,
): Promise<RawAnalyzedListing | null> {
  const brand = extractBrand(listing.title);
  const { model_key, model_label } = extractModelKey(brand, listing.title);
  const { model_line, model_line_label } = extractModelLine(brand, model_key);
  let release_year = getReleaseYear(model_key);

  if (isPlatformExcluded(brand, listing.title, model_key, platform_settings)) {
    return null;
  }

  // Ранняя проверка на "мусор" — ДО дорогих сетевых запросов (iFixit,
  // запчасти). Явный мусор (неизвестная модель, слишком старый год,
  // нереалистичная цена, лот/сервис прямо в заголовке) виден уже здесь, без
  // необходимости грузить и парсить страницу самого объявления — экономит
  // время скана на заведомо отбрасываемых карточках.
  const early_junk_check = evaluateJunkStatus(
    { title: listing.title, post_summary: "", brand, model_key, price_buy: listing.price_value, release_year },
    junk_settings,
  );
  if (early_junk_check.is_junk) {
    return null;
  }

  let damage_types: string[] = [];
  let post_summary = "";
  let device_query = listing.title;
  let has_box = false;
  let battery_health_percent: number | null = null;
  let seller_name: string | null = null;
  let seller_ads_count: number | null = null;
  let seller_member_since: string | null = null;

  try {
    const signals = await extractOlxListingSignals(listing, battery_threshold_percent);
    damage_types = signals.damage_types;
    post_summary = signals.post_summary;
    device_query = signals.device_query || listing.title;
    has_box = signals.has_box;
    battery_health_percent = signals.battery_health_percent;
    seller_name = signals.seller_name;
    seller_ads_count = signals.seller_ads_count;
    seller_member_since = signals.seller_member_since;
  } catch {
    // Если получить описание объявления не удалось — продолжаем с заголовком
    // и без повреждений (лучше проанализировать частично, чем упустить лот).
  }

  // Повторная проверка теперь с post_summary — ловит лоты/сервисные
  // объявления, упомянутые только в тексте описания, а не в заголовке.
  const final_junk_check = evaluateJunkStatus(
    { title: listing.title, post_summary, brand, model_key, price_buy: listing.price_value, release_year },
    junk_settings,
  );
  if (final_junk_check.is_junk) {
    return null;
  }

  const model_short = device_query.split(" ").slice(0, 3).join(" ");

  // Поиск iFixit и поиск/оценка цен на запчасти не зависят друг от друга —
  // раньше шли строго последовательно (запчасти ждали iFixit впустую).
  const [ifixit_data, allegro_data] = await Promise.all([
    resolveIfixitDataForQuery(device_query, brand, model_key, cache_ttl_hours),
    fetchPartsData(brand, model_short, model_key, damage_types, cache_ttl_hours),
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
  for (const [storage_key, prices] of prices_by_model_storage) {
    if (prices.length < MIN_COMPARABLE_LISTINGS_FOR_MEDIAN) continue;
    by_model_storage.set(storage_key, median(prices));
  }

  const by_model = new Map<string, number>();
  for (const [model_key, prices] of prices_by_model) {
    if (prices.length < MIN_COMPARABLE_LISTINGS_FOR_MEDIAN) continue;
    by_model.set(model_key, median(prices));
  }

  return { by_model_storage, by_model };
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

/**
 * Вторая фаза: считает market_sell_price/profitability/liquidity сразу для
 * всех объявлений скана, потому что медиана цены модели требует видеть ВСЕ
 * объявления той же модели одновременно — раньше эта же цена оценивалась
 * циклически из buy_price ОДНОГО объявления (см. план/TODO.md).
 */
async function finalizeDevices(raw_listings: RawAnalyzedListing[], cache_ttl_hours: number): Promise<AnalyzedDevice[]> {
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
  await Promise.all(
    Array.from(model_keys_needing_cache_lookup).map(async (composite_key) => {
      const [brand, model_key] = composite_key.split("::");
      const cached = await getModelCache(brand, model_key);
      if (cached?.avg_market_price) {
        cached_price_by_composite_key.set(composite_key, cached.avg_market_price);
      }
    }),
  );

  const finalized = raw_listings.map((raw) => {
    const is_damaged = raw.damage_types.length > 0;
    const storage_gb = extractStorageGb(`${raw.title} ${raw.post_summary}`);
    const model_hint_price = getModelMarketPrice(raw.model_key, storage_gb);

    const median_price = resolveMedianPrice(median_maps, raw.model_key, storage_gb);
    const cached_median_price = median_price === null
      ? cached_price_by_composite_key.get(`${raw.brand}::${raw.model_key}`) ?? null
      : null;
    const cached_median_adjusted = cached_median_price !== null && storage_gb !== null
      ? Math.round(
        cached_median_price * getStorageMultiplier(storage_gb) / getStorageMultiplier(MARKET_REFERENCE_STORAGE_GB),
      )
      : cached_median_price;
    const anchor_price = median_price ?? model_hint_price ?? cached_median_adjusted;

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

    const liquidity_data = getLiquidityScore({
      brand: raw.brand,
      model_query: raw.model_query,
      release_year: raw.release_year,
      has_box: raw.has_box,
      battery_health_percent: raw.battery_health_percent,
      storage_gb,
      market_median_price: anchor_price,
      damage_types: raw.damage_types,
    });

    const profitability = calculateProfitability({
      price_buy: raw.price_buy,
      parts: raw.allegro_parts,
      market_sell_price,
      repairability_score: raw.repairability_score,
      repairability_scale: raw.repairability_scale,
    });

    const device: AnalyzedDevice = {
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
    return device;
  });

  // Обновляем кросс-скановый якорь цены ТОЛЬКО для моделей, у которых в этом
  // скане была настоящая медиана (не сам кэш и не грубый brand-эстимейт) —
  // иначе одна неточная оценка "протухшей" модели постепенно портила бы саму
  // себя на следующих сканах.
  const fresh_median_by_composite_key = new Map<string, number>();
  for (const raw of raw_listings) {
    const model_median = median_maps.by_model.get(raw.model_key);
    if (model_median !== undefined) {
      fresh_median_by_composite_key.set(`${raw.brand}::${raw.model_key}`, model_median);
    }
  }
  await Promise.all(
    Array.from(fresh_median_by_composite_key.entries()).map(([composite_key, avg_market_price]) => {
      const [brand, model_key] = composite_key.split("::");
      return upsertModelCache(brand, model_key, { avg_market_price }, cache_ttl_hours);
    }),
  );

  return finalized.sort((a, b) => (b.profitability_pct ?? -999) - (a.profitability_pct ?? -999));
}

export interface PipelineProgress {
  stage: "fetching_listings" | "analyzing";
  total_listings?: number;
  processed_listings?: number;
}

export async function runFullPipeline(
  on_progress?: (progress: PipelineProgress) => void,
): Promise<AnalyzedDevice[]> {
  on_progress?.({ stage: "fetching_listings" });

  const listings = await fetchOlxListingsForStates({
    states: config.pipeline.olx_state_filters,
    max_pages: config.pipeline.olx_max_pages,
    limit: config.pipeline.olx_page_limit,
  });

  on_progress?.({ stage: "analyzing", total_listings: listings.length, processed_listings: 0 });

  // Настройки читаются один раз на весь скан из БД — применяются к
  // следующему запуску пайплайна, а не "на лету" к уже сохранённым
  // устройствам предыдущего скана.
  const app_settings = await getAppSettings();
  const battery_threshold_percent = app_settings.battery_health_threshold_percent;
  const cache_ttl_hours = app_settings.cache_ttl_hours;
  const junk_settings: JunkFilterSettings = {
    exclude_junk_listings: app_settings.exclude_junk_listings,
    junk_min_release_year: app_settings.junk_min_release_year,
  };
  const platform_settings: PlatformFilterSettings = {
    exclude_iphone: app_settings.exclude_iphone,
    exclude_android: app_settings.exclude_android,
  };

  let processed_count = 0;
  const raw_results = await runWithConcurrency(
    listings,
    config.pipeline.concurrency,
    (listing) => analyzeSingleListing(
      listing,
      battery_threshold_percent,
      junk_settings,
      platform_settings,
      cache_ttl_hours,
    ),
    () => {
      processed_count += 1;
      on_progress?.({ stage: "analyzing", processed_listings: processed_count });
    },
  );
  // null — объявление признано мусором (см. junk-filter.ts) и не должно
  // попасть ни в медиану цены, ни в сохранённые устройства.
  const raw_listings = raw_results.filter((raw): raw is RawAnalyzedListing => raw !== null);

  return finalizeDevices(raw_listings, cache_ttl_hours);
}
