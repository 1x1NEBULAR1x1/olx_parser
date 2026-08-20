import { createJobQueue } from "@/server/scan/job-queue";
import { getKimovilScoresCached } from "@/server/domain/liquidity-calculator/kimovil-cache";
import { fetchPartsForCatalogEntry } from "@/server/catalog/manual-parts-fetch";
import { prefetchOlxMarketPrices } from "@/server/fetchers/olx-market-price-fetcher";
import {
  upsertModelCache,
  upsertModelCacheBatch,
  upsertPartsCostCache,
  type ModelMedianCacheItem,
} from "@/server/repositories/devices-repository";
import { createLogger } from "@/server/shared/logger";
import type { AnalyzedDevice } from "@/shared/types/domain";
import type { IfixitCacheWrite } from "@/server/scan/pipeline";
import type { PartsCacheWrite } from "@/server/scan/parts-chain";

const jobs_log = createLogger("scan-jobs");
const MAX_KIMOVIL_JOBS_PER_SCAN = 20;
const MAX_OLX_MARKET_JOBS_PER_SCAN = 40;

interface KimovilPrefetchPayload {
  brand: string;
  model_key: string;
  model_name: string;
  cache_ttl_hours: number;
}

interface AllegroPrefetchPayload {
  catalog_entry_id: number;
  cache_ttl_hours: number;
}

interface MedianCachePayload {
  items: ModelMedianCacheItem[];
  cache_ttl_hours: number;
}

interface OlxMarketPrefetchPayload {
  requests: Array<{ brand: string; model_key: string; model_label: string }>;
  cache_ttl_hours: number;
}

interface L2CachePayload {
  ifixit: IfixitCacheWrite[];
  parts: PartsCacheWrite[];
}

export const scan_job_queue = createJobQueue({
  kimovil_prefetch: async (payload) => {
    const job = payload as unknown as KimovilPrefetchPayload;
    await getKimovilScoresCached(
      job.brand,
      job.model_key,
      job.model_name,
      job.cache_ttl_hours,
    );
  },
  allegro_prefetch: async (payload) => {
    const job = payload as unknown as AllegroPrefetchPayload;
    await fetchPartsForCatalogEntry(job.catalog_entry_id, job.cache_ttl_hours, {
      sources: ["allegro"],
      use_default_damage_sets: true,
    });
  },
  median_cache: async (payload) => {
    const job = payload as unknown as MedianCachePayload;
    const count = await upsertModelCacheBatch(job.items, job.cache_ttl_hours);
    jobs_log.info("Медианы ModelCache сохранены в фоне", { models: count });
  },
  olx_market_prefetch: async (payload) => {
    const job = payload as unknown as OlxMarketPrefetchPayload;
    const fetched = await prefetchOlxMarketPrices(job.requests, job.cache_ttl_hours);
    jobs_log.info("OLX-медианы сохранены в фоне", { models: fetched.size });
  },
  l2_cache: async (payload) => {
    const job = payload as unknown as L2CachePayload;
    for (const item of job.ifixit) {
      await upsertModelCache(item.brand, item.model_key, item.patch, item.cache_ttl_hours);
    }
    for (const item of job.parts) {
      await upsertPartsCostCache(
        item.brand,
        item.model_key,
        item.damage_signature,
        item.entry,
        item.cache_ttl_hours,
      );
    }
    jobs_log.info("L2-кеш скана записан в фоне", {
      ifixit: job.ifixit.length,
      parts: job.parts.length,
    });
  },
});

export function enqueueL2CacheWrites(
  ifixit: IfixitCacheWrite[],
  parts: PartsCacheWrite[],
): void {
  const ifixit_unique = [...new Map(
    ifixit.map((item) => [`${item.brand}::${item.model_key}`, item]),
  ).values()];
  const parts_unique = [...new Map(
    parts.map((item) => [`${item.brand}::${item.model_key}::${item.damage_signature}`, item]),
  ).values()];
  if (ifixit_unique.length === 0 && parts_unique.length === 0) return;
  void scan_job_queue.enqueue("l2_cache", { ifixit: ifixit_unique, parts: parts_unique }).catch((error) => {
    jobs_log.warn("Фоновая запись L2-кеша не удалась", {
      ifixit: ifixit_unique.length,
      parts: parts_unique.length,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export function enqueueKimovilPrefetch(
  devices: AnalyzedDevice[],
  cache_ttl_hours: number,
): void {
  const counts = new Map<string, KimovilPrefetchPayload & { count: number }>();

  for (const device of devices) {
    if (!device.model_key || device.brand === "unknown") continue;
    const key = `${device.brand}::${device.model_key}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(key, {
      brand: device.brand,
      model_key: device.model_key,
      model_name: device.model_label || device.model_query,
      cache_ttl_hours,
      count: 1,
    });
  }

  const top = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_KIMOVIL_JOBS_PER_SCAN);

  for (const job of top) {
    void scan_job_queue.enqueue("kimovil_prefetch", {
      brand: job.brand,
      model_key: job.model_key,
      model_name: job.model_name,
      cache_ttl_hours: job.cache_ttl_hours,
    }).catch((error) => {
      jobs_log.warn("Kimovil prefetch failed", {
        brand: job.brand,
        model_key: job.model_key,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  if (top.length > 0) {
    jobs_log.info("Kimovil prefetch поставлен в очередь", { models: top.length });
  }
}

export function enqueueMedianCacheWrites(
  items: ModelMedianCacheItem[],
  cache_ttl_hours: number,
): void {
  if (items.length === 0) return;
  void scan_job_queue.enqueue("median_cache", { items, cache_ttl_hours })
    .catch((error) => {
      jobs_log.warn("Фоновая запись медиан не удалась", {
        models: items.length,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  jobs_log.info("Медианы ModelCache поставлены в очередь", { models: items.length });
}

export function enqueueOlxMarketPrefetch(
  requests: Array<{ brand: string; model_key: string; model_label: string; count?: number }>,
  cache_ttl_hours: number,
): void {
  if (requests.length === 0) return;
  const unique = new Map<string, { brand: string; model_key: string; model_label: string; count: number }>();
  for (const req of requests) {
    const key = `${req.brand}::${req.model_key}`;
    const existing = unique.get(key);
    if (existing) {
      existing.count += req.count ?? 1;
      continue;
    }
    unique.set(key, {
      brand: req.brand,
      model_key: req.model_key,
      model_label: req.model_label,
      count: req.count ?? 1,
    });
  }

  const top = Array.from(unique.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_OLX_MARKET_JOBS_PER_SCAN)
    .map(({ brand, model_key, model_label }) => ({ brand, model_key, model_label }));

  void scan_job_queue.enqueue("olx_market_prefetch", { requests: top, cache_ttl_hours })
    .catch((error) => {
      jobs_log.warn("Фоновый prefetch OLX-медиан не удался", {
        models: top.length,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  jobs_log.info("OLX-медианы поставлены в очередь", { models: top.length });
}

export function enqueueAllegroPrefetch(catalog_entry_id: number, cache_ttl_hours: number): void {
  void scan_job_queue.enqueue("allegro_prefetch", { catalog_entry_id, cache_ttl_hours })
    .catch((error) => {
      jobs_log.warn("Allegro prefetch failed", {
        catalog_entry_id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
