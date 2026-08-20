import { prisma } from "@/shared/db/client";
import { CATALOG_PREFETCH_DAMAGE_SETS } from "@/shared/types/catalog";
import { resolveStartingMarketPrice } from "@/server/domain/model-market-price-hints";
import {
  buildStaticPartStubs,
  getRepairabilityStub,
  isPartEstimate,
} from "@/server/domain/repair-parts-stubs";
import { buildAllegroSearchUrl } from "@/server/domain/static-parts-prices";
import { getAppSettings, upsertPartsCostCache } from "@/server/repositories/devices-repository";
import { createLogger } from "@/server/shared/logger";
import type { AllegroPart } from "@/shared/types/domain";

const seed_log = createLogger("catalog-seed");

function buildDamageSignature(damage_types: string[]): string {
  return [...damage_types].sort().join(",");
}

function cacheHasRealParts(parts_json: string | null): boolean {
  if (!parts_json) return false;
  try {
    const parts = JSON.parse(parts_json) as AllegroPart[];
    return parts.some((part) => part.price !== null && !isPartEstimate(part));
  } catch {
    return false;
  }
}

export interface CatalogSeedResult {
  priced: number;
  parts_sets: number;
}

/**
 * Проставляет каждой модели каталога стартовые цены продажи и ★-оценки запчастей.
 * Реальные Allegro/OLX/Ceneo не затираются — алгоритм потом подменит оценки.
 */
export async function seedCatalogStartingData(): Promise<CatalogSeedResult> {
  const settings = await getAppSettings();
  const entries = await prisma.deviceCatalogEntry.findMany({
    select: {
      id: true,
      brand: true,
      model_key: true,
      model_label: true,
      model_query: true,
      market_sell_price: true,
      lock_market_price: true,
      repairability_score: true,
      enrichment_status: true,
    },
  });

  let priced = 0;
  let parts_sets = 0;

  for (const entry of entries) {
    const model_query = entry.model_query || entry.model_label || entry.model_key;
    const starting_price = resolveStartingMarketPrice(entry.brand, entry.model_key);

    if (!entry.lock_market_price && entry.market_sell_price === null) {
      const stub = entry.repairability_score === null ? getRepairabilityStub(entry.brand) : null;
      await prisma.deviceCatalogEntry.update({
        where: { id: entry.id },
        data: {
          market_sell_price: starting_price,
          market_sell_price_source: "model_hint",
          ...(stub
            ? {
                repairability_score: stub.repairability_score,
                repairability_scale: stub.repairability_scale,
              }
            : {}),
          enrichment_status: entry.enrichment_status === "pending" ? "ready" : entry.enrichment_status,
        },
      });
      priced += 1;
    }

    for (const damage_types of CATALOG_PREFETCH_DAMAGE_SETS) {
      const damage_signature = buildDamageSignature(damage_types);
      const existing = await prisma.partsCostCache.findUnique({
        where: {
          brand_model_key_damage_signature: {
            brand: entry.brand,
            model_key: entry.model_key,
            damage_signature,
          },
        },
        select: { parts_json: true },
      });
      if (cacheHasRealParts(existing?.parts_json ?? null)) continue;

      const parts = buildStaticPartStubs(
        entry.brand,
        model_query,
        entry.model_label || entry.model_key,
        damage_types,
        128,
      );
      await upsertPartsCostCache(
        entry.brand,
        entry.model_key,
        damage_signature,
        {
          parts,
          search_url: buildAllegroSearchUrl(entry.brand, model_query, damage_types),
        },
        settings.cache_ttl_hours,
      );
      parts_sets += 1;
    }
  }

  seed_log.info("Стартовые цены каталога проставлены", { priced, parts_sets, models: entries.length });
  return { priced, parts_sets };
}
