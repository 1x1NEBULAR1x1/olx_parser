import { isAntibotError } from "@/server/fetchers/antibot";
import { config } from "@/server/shared/config";
import { getAllegroCache, setAllegroCache } from "@/server/shared/cache";
import { fetchAllegroParts } from "@/server/fetchers/allegro-parts-fetcher";
import { fetchCeneoParts } from "@/server/fetchers/ceneo-fetcher";
import { fetchOlxParts } from "@/server/fetchers/olx-parts-fetcher";
import { fetchPartsStoreParts } from "@/server/fetchers/parts-store-fetcher";
import { fetchPolishShopParts } from "@/server/fetchers/polish-shop-fetcher";
import { getPartsCostCache, upsertPartsCostCache } from "@/server/repositories/devices-repository";
import {
  buildAllegroSearchUrl,
  PART_SEARCH_KEYWORDS,
} from "@/server/domain/static-parts-prices";
import {
  buildStaticPartStub,
  ensurePartsStubsForDamageTypes,
  isPartEstimate,
} from "@/server/domain/repair-parts-stubs";
import { normalizeFetcherSource, tagFetchedParts } from "@/server/fetchers/html-image";
import { countRealParts, getPartSourceRank, selectRankedParts } from "@/shared/lib/parts-rank";
import { inferPartSource } from "@/shared/lib/part-utils";
import type { AllegroPart, PartSource } from "@/shared/types/domain";
import type { PartsCostCacheEntry } from "@/shared/types/api-contracts";

export interface PartsCacheWrite {
  brand: string;
  model_key: string;
  damage_signature: string;
  entry: PartsCostCacheEntry;
  cache_ttl_hours: number;
}

export interface PartsFetchProgress {
  stage: "parts" | "waiting_antibot";
  source: PartSource;
  wait_until_ms?: number;
  attempt?: number;
}

export interface FetchPartsOptions {
  /** Включить Allegro в цепочку (по умолчанию выключено — только ручной запуск из админки). */
  include_allegro?: boolean;
  /** Только указанные источники, в порядке приоритета (режим ручного парсинга). */
  manual_sources?: PartSource[];
  /** Игнорировать L1/L2 кеш и заново запросить источники. */
  force_refresh?: boolean;
  /** При ручном скане одного источника сохранить позиции остальных. */
  merge_existing?: boolean;
  signal?: AbortSignal;
  on_source_error?: (source: PartSource, message: string) => void;
  on_l2_write?: (write: PartsCacheWrite) => void;
  /** Пауза и повторы только для каталога / ручной загрузки, не для скана ленты. */
  antibot_wait_seconds?: number;
  antibot_retries?: number;
  on_progress?: (progress: PartsFetchProgress) => void;
}

function buildDamageSignature(damage_types: string[]): string {
  return [...damage_types].sort().join(",");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPartsForDamageType(
  brand: string,
  model_short: string,
  model_query: string,
  model_label: string,
  damage_type: string,
  storage_gb: number | null,
  options: FetchPartsOptions,
): Promise<AllegroPart[]> {
  const keyword = PART_SEARCH_KEYWORDS[damage_type];
  const parts_limit = config.pipeline.allegro_parts_per_model;
  const fetch_limit = Math.max(parts_limit * 2, 6);

  if (!keyword) {
    return [buildStaticPartStub(brand, model_query, model_label, damage_type, storage_gb)];
  }

  const source_fetchers: Array<{ source: PartSource; fetch: () => Promise<{ parts: AllegroPart[]; source: string }> }> = [
    {
      source: "allegro",
      fetch: () => fetchAllegroParts(brand, model_short, damage_type, keyword, fetch_limit, options.signal),
    },
    {
      source: "ceneo",
      fetch: () => fetchCeneoParts(brand, model_short, damage_type, keyword, fetch_limit, options.signal),
    },
    {
      source: "parts_store",
      fetch: () => fetchPartsStoreParts(brand, model_short, damage_type, keyword, fetch_limit, options.signal),
    },
    {
      source: "shop",
      fetch: () => fetchPolishShopParts(brand, model_short, damage_type, keyword, fetch_limit, options.signal),
    },
    {
      source: "olx",
      fetch: () => fetchOlxParts(brand, model_short, damage_type, keyword, fetch_limit, options.signal),
    },
  ];

  const fetchers = options.manual_sources?.length
    ? source_fetchers.filter((entry) => new Set(options.manual_sources).has(entry.source))
    : source_fetchers.filter((entry) => {
        if (entry.source === "allegro" && !options.include_allegro) return false;
        if (entry.source === "ceneo" && config.pipeline.skip_ceneo_parts) return false;
        return true;
      });

  const waves = new Map<number, typeof fetchers>();
  for (const fetcher of fetchers) {
    const rank = getPartSourceRank(fetcher.source);
    const wave = waves.get(rank) ?? [];
    wave.push(fetcher);
    waves.set(rank, wave);
  }

  const collected: AllegroPart[] = [];
  for (const rank of [...waves.keys()].sort((a, b) => a - b)) {
    if (options.signal?.aborted) break;
    const wave = waves.get(rank) ?? [];
    const wait_seconds = options.antibot_wait_seconds ?? 0;
    const retries = options.antibot_retries ?? 0;
    const wave_parts = await Promise.all(
      wave.map(async ({ source, fetch }) => {
        options.on_progress?.({ stage: "parts", source });
        for (let attempt = 0; attempt <= retries; attempt += 1) {
          try {
            const result = await fetch();
            return tagFetchedParts(
              result.parts,
              damage_type,
              normalizeFetcherSource(result.source ?? source),
            );
          } catch (error) {
            const can_wait = isAntibotError(error) && attempt < retries && wait_seconds > 0;
            if (can_wait) {
              const wait_until_ms = Date.now() + wait_seconds * 1000;
              options.on_progress?.({
                stage: "waiting_antibot",
                source,
                wait_until_ms,
                attempt: attempt + 1,
              });
              await sleep(wait_seconds * 1000);
              continue;
            }
            const message = error instanceof Error ? error.message : String(error);
            options.on_source_error?.(source, message);
            return [] as AllegroPart[];
          }
        }
        return [] as AllegroPart[];
      }),
    );
    collected.push(...wave_parts.flat());
    const ranked = selectRankedParts(collected, parts_limit);
    if (countRealParts(ranked) >= parts_limit) {
      return ranked;
    }
  }

  const ranked = selectRankedParts(collected, parts_limit);
  if (countRealParts(ranked) > 0) return ranked;
  return [buildStaticPartStub(brand, model_query, model_label, damage_type, storage_gb)];
}

export async function fetchPartsData(
  brand: string,
  model_query: string,
  model_label: string,
  model_key: string,
  damage_types: string[],
  cache_ttl_hours: number,
  storage_gb: number | null,
  options: FetchPartsOptions = {},
): Promise<PartsCostCacheEntry> {
  const damage_signature = buildDamageSignature(damage_types);
  const fallback_search_url = buildAllegroSearchUrl(brand, model_query, damage_types);

  if (!options.force_refresh) {
    const cached = getAllegroCache(brand, model_query, damage_types);
    if (cached) return cached;

    const db_cached = await getPartsCostCache(brand, model_key, damage_signature);
    if (db_cached?.parts.some((part) => !isPartEstimate(part))) {
      setAllegroCache(brand, model_query, damage_types, db_cached);
      return db_cached;
    }
  }

  let existing_parts: AllegroPart[] = [];
  if (options.merge_existing) {
    const db_cached = await getPartsCostCache(brand, model_key, damage_signature);
    existing_parts = db_cached?.parts ?? [];
  }

  if (damage_types.length === 0) {
    const empty_entry: PartsCostCacheEntry = { parts: [], search_url: fallback_search_url };
    setAllegroCache(brand, model_query, damage_types, empty_entry);
    return empty_entry;
  }

  const model_short = model_query.split(" ").slice(0, 3).join(" ");
  const results_by_type = await Promise.all(
    damage_types.map(async (damage_type) => {
      try {
        return await fetchPartsForDamageType(
          brand,
          model_short,
          model_query,
          model_label,
          damage_type,
          storage_gb,
          options,
        );
      } catch {
        return [buildStaticPartStub(brand, model_query, model_label, damage_type, storage_gb)];
      }
    }),
  );

  const fetched_sources = new Set(options.manual_sources ?? []);
  const kept = options.merge_existing && fetched_sources.size > 0
    ? existing_parts.filter((part) => !fetched_sources.has(inferPartSource(part)))
    : [];

  const rank_limit = options.merge_existing
    ? Math.max(config.pipeline.allegro_parts_per_model, 8)
    : config.pipeline.allegro_parts_per_model;

  const parts = ensurePartsStubsForDamageTypes(
    selectRankedParts([...kept, ...results_by_type.flat()], rank_limit),
    damage_types,
    brand,
    model_query,
    model_label,
    storage_gb,
  );

  const entry: PartsCostCacheEntry = { parts, search_url: fallback_search_url };
  setAllegroCache(brand, model_query, damage_types, entry);
  const cache_write: PartsCacheWrite = {
    brand,
    model_key,
    damage_signature,
    entry,
    cache_ttl_hours,
  };
  if (options.on_l2_write) {
    options.on_l2_write(cache_write);
  } else {
    void upsertPartsCostCache(brand, model_key, damage_signature, entry, cache_ttl_hours);
  }
  return entry;
}
