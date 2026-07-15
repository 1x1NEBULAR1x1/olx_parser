import { config } from "@/server/shared/config";
import { getAllegroCache, setAllegroCache } from "@/server/shared/cache";
import { fetchAllegroParts } from "@/server/fetchers/allegro-parts-fetcher";
import { fetchCeneoParts } from "@/server/fetchers/ceneo-fetcher";
import { fetchOlxParts } from "@/server/fetchers/olx-parts-fetcher";
import { fetchPartsStoreParts } from "@/server/fetchers/parts-store-fetcher";
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
import type { AllegroPart, PartSource } from "@/shared/types/domain";
import type { PartsCostCacheEntry } from "@/shared/types/api-contracts";
import { inferPartSource } from "@/shared/lib/part-utils";

function buildDamageSignature(damage_types: string[]): string {
  return [...damage_types].sort().join(",");
}

function normalizeFetcherSource(source: string): PartSource {
  if (source === "parts_store") return "parts_store";
  if (source === "olx") return "olx";
  if (source === "ceneo") return "ceneo";
  return "allegro";
}

function tagParts(parts: AllegroPart[], damage_type: string, source: PartSource): AllegroPart[] {
  return parts.map((part) => ({
    ...part,
    damage_type,
    source: part.source ?? source,
    is_estimate: part.is_estimate ?? isPartEstimate(part),
  }));
}

async function fetchPartsForDamageType(
  brand: string,
  model_short: string,
  model_query: string,
  model_label: string,
  damage_type: string,
  storage_gb: number | null,
): Promise<AllegroPart[]> {
  const keyword = PART_SEARCH_KEYWORDS[damage_type];
  const parts_limit = config.pipeline.allegro_parts_per_model;

  if (!keyword) {
    return [buildStaticPartStub(brand, model_query, model_label, damage_type, storage_gb)];
  }

  const sources = [
    () => fetchPartsStoreParts(brand, model_short, damage_type, keyword, parts_limit),
    () => fetchAllegroParts(brand, model_short, damage_type, keyword, parts_limit),
    () => fetchOlxParts(brand, model_short, damage_type, keyword, parts_limit),
    () => fetchCeneoParts(brand, model_short, damage_type, keyword, parts_limit),
  ];

  for (const fetch_source of sources) {
    const result = await fetch_source();
    if (result.parts.length > 0) {
      return tagParts(result.parts, damage_type, normalizeFetcherSource(result.source));
    }
  }

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
): Promise<PartsCostCacheEntry> {
  const cached = getAllegroCache(brand, model_query, damage_types);
  if (cached) return cached;

  const damage_signature = buildDamageSignature(damage_types);
  const db_cached = await getPartsCostCache(brand, model_key, damage_signature);
  if (db_cached?.parts.some((part) => inferPartSource(part) === "parts_store")) {
    setAllegroCache(brand, model_query, damage_types, db_cached);
    return db_cached;
  }

  const fallback_search_url = buildAllegroSearchUrl(brand, model_query, damage_types);

  if (damage_types.length === 0) {
    const empty_entry: PartsCostCacheEntry = { parts: [], search_url: fallback_search_url };
    setAllegroCache(brand, model_query, damage_types, empty_entry);
    return empty_entry;
  }

  const model_short = model_query.split(" ").slice(0, 3).join(" ");
  const results_by_type = await Promise.all(
    damage_types.map((damage_type) => fetchPartsForDamageType(
      brand,
      model_short,
      model_query,
      model_label,
      damage_type,
      storage_gb,
    )),
  );

  const parts = ensurePartsStubsForDamageTypes(
    results_by_type.flat(),
    damage_types,
    brand,
    model_query,
    model_label,
    storage_gb,
  );

  const entry: PartsCostCacheEntry = { parts, search_url: fallback_search_url };
  setAllegroCache(brand, model_query, damage_types, entry);
  void upsertPartsCostCache(brand, model_key, damage_signature, entry, cache_ttl_hours);
  return entry;
}
