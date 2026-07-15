import { fetchOlxListingsPage } from "@/server/fetchers/olx-fetcher/fetcher";
import { extractStorageGb, getStorageMultiplier, MARKET_REFERENCE_STORAGE_GB } from "@/server/domain/model-market-price-hints";
import { getModelCache, upsertModelCache } from "@/server/repositories/devices-repository";
import { createConcurrencyLimiter } from "@/server/shared/concurrency-limiter";
import { createLogger } from "@/server/shared/logger";

const market_log = createLogger("olx-market");

const olx_market_limiter = createConcurrencyLimiter(3, 250);

const DAMAGED_TITLE_MARKERS = [
  "uszkodz", "pękni", "pekni", "zbity", "zbity", "pęknięty", "crack",
  "nie działa", "nie dziala", "do naprawy", "na części", "na czesci",
  "icloud", "frp", "blokada", "locked", "zalan", "woda",
];

const MIN_MARKET_SAMPLES = 3;
const MAX_MARKET_SAMPLES = 30;

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function looksUndamagedListing(title: string): boolean {
  const normalized = title.toLowerCase();
  return !DAMAGED_TITLE_MARKERS.some((marker) => normalized.includes(marker));
}

function normalizePriceToReferenceStorage(price: number, storage_gb: number | null): number {
  const effective_storage = storage_gb ?? MARKET_REFERENCE_STORAGE_GB;
  return Math.round(
    price * getStorageMultiplier(MARKET_REFERENCE_STORAGE_GB) / getStorageMultiplier(effective_storage),
  );
}

function buildMarketSearchQuery(brand: string, model_label: string, model_key: string): string {
  const label = model_label.trim();
  if (label) return label;
  if (brand !== "unknown") return `${brand} ${model_key.replace(/-/g, " ")}`;
  return model_key.replace(/-/g, " ");
}

/**
 * Ищет на OLX б/у объявления той же модели и возвращает медиану цены
 * исправных устройств. Результат кэшируется в ModelCache.avg_market_price.
 */
export async function fetchOlxMarketMedianPrice(
  brand: string,
  model_key: string,
  model_label: string,
  cache_ttl_hours: number,
): Promise<number | null> {
  const cached = await getModelCache(brand, model_key);
  if (cached?.avg_market_price) {
    return cached.avg_market_price;
  }

  const search_query = buildMarketSearchQuery(brand, model_label, model_key);

  const page = await olx_market_limiter(() =>
    fetchOlxListingsPage({
      offset: 0,
      limit: MAX_MARKET_SAMPLES,
      state_filter: "used",
      query: search_query,
    }).catch(() => null),
  );

  if (!page) return null;

  const normalized_prices: number[] = [];
  for (const listing of page.items) {
    if (!listing.price_value || listing.price_value <= 0) continue;
    if (!looksUndamagedListing(listing.title)) continue;

    const storage_gb = extractStorageGb(listing.title);
    const normalized = normalizePriceToReferenceStorage(listing.price_value, storage_gb);
    if (normalized < 80 || normalized > 25_000) continue;
    normalized_prices.push(normalized);
  }

  if (normalized_prices.length < MIN_MARKET_SAMPLES) {
    market_log.debug("Недостаточно сравнимых OLX цен", {
      brand,
      model_key,
      query: search_query,
      samples: normalized_prices.length,
    });
    return null;
  }

  const median_price = computeMedian(normalized_prices);
  if (median_price === null) return null;

  await upsertModelCache(brand, model_key, { avg_market_price: median_price }, cache_ttl_hours);
  market_log.info("Сохранена медиана OLX", { brand, model_key, median_price, samples: normalized_prices.length });
  return median_price;
}

export async function prefetchOlxMarketPrices(
  requests: Array<{ brand: string; model_key: string; model_label: string }>,
  cache_ttl_hours: number,
): Promise<Map<string, number>> {
  const unique = new Map<string, { brand: string; model_key: string; model_label: string }>();
  for (const req of requests) {
    unique.set(`${req.brand}::${req.model_key}`, req);
  }

  const result = new Map<string, number>();
  await Promise.all(
    Array.from(unique.values()).map(async (req) => {
      const composite_key = `${req.brand}::${req.model_key}`;
      const price = await fetchOlxMarketMedianPrice(
        req.brand,
        req.model_key,
        req.model_label,
        cache_ttl_hours,
      );
      if (price !== null) {
        result.set(composite_key, price);
      }
    }),
  );

  return result;
}
