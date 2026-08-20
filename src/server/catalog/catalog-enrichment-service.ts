import { lookupIfixitDeviceMatch } from "@/server/fetchers/olx-fetcher/fix-parser";
import { resolveStartingMarketPrice } from "@/server/domain/model-market-price-hints";
import { getReleaseYear } from "@/server/domain/liquidity-calculator/release-year-hints";
import {
  buildIfixitSearchStubUrl,
  getRepairabilityStub,
} from "@/server/domain/repair-parts-stubs";
import { fetchPartsData } from "@/server/scan/parts-chain";
import {
  getCatalogEntryById,
  patchCatalogEntry,
  updateCatalogEnrichmentResult,
} from "@/server/repositories/catalog-repository";
import { upsertModelCache } from "@/server/repositories/devices-repository";
import { CATALOG_PREFETCH_DAMAGE_SETS } from "@/shared/types/catalog";
import { createLogger } from "@/server/shared/logger";
import { resolveRepairabilityOnEnrich } from "@/server/catalog/keep-repairability";
import type { CatalogLiveProgress } from "@/shared/types/catalog";

const enrich_log = createLogger("catalog-enrich");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EnrichCatalogEntryOptions {
  cache_ttl_hours: number;
  delay_ms?: number;
  include_allegro?: boolean;
  antibot_wait_seconds?: number;
  antibot_retries?: number;
  on_progress?: (patch: Partial<CatalogLiveProgress>) => void;
}

export async function enrichCatalogEntryById(
  entry_id: number,
  options: EnrichCatalogEntryOptions,
): Promise<boolean> {
  const entry = await getCatalogEntryById(entry_id);
  if (!entry) return false;

  await patchCatalogEntry(entry_id, { enrichment_status: "enriching" });

  const model_query = entry.model_query || entry.model_label || entry.model_key;
  const model_label = entry.model_label || entry.model_key;
  const delay_ms = options.delay_ms ?? 400;
  const include_allegro = options.include_allegro ?? false;

  options.on_progress?.({
    current_entry_id: entry_id,
    current_brand: entry.brand,
    current_model_label: model_label,
    current_stage: "repairability",
    current_source: "ifixit",
    current_set_index: null,
    current_set_total: CATALOG_PREFETCH_DAMAGE_SETS.length,
    wait_until_ms: null,
    wait_reason: null,
    message: null,
  });

  try {
    let repairability = {
      repairability_score: entry.repairability_score,
      repairability_scale: entry.repairability_scale,
      ifixit_device_name: entry.ifixit_device_name,
      ifixit_url: entry.ifixit_url,
    };
    let release_year = entry.release_year ?? getReleaseYear(entry.model_key);

    if (entry.lock_repairability && entry.manual_repairability_score !== null) {
      repairability = {
        ...repairability,
        repairability_score: entry.manual_repairability_score,
        repairability_scale: entry.manual_repairability_scale,
      };
    } else if (!entry.lock_repairability) {
      try {
        const ifixit = await lookupIfixitDeviceMatch(model_query);
        repairability = resolveRepairabilityOnEnrich({
          previous: repairability,
          ifixit: {
            repairability_score: ifixit.repairability_score,
            repairability_scale: ifixit.repairability_scale,
            device_name: ifixit.device_name,
            device_url: ifixit.device_url,
          },
          stub: getRepairabilityStub(entry.brand),
          stub_url: buildIfixitSearchStubUrl(model_query),
        });
        if (ifixit.release_year !== null) release_year = ifixit.release_year;
      } catch {
        repairability = resolveRepairabilityOnEnrich({
          previous: repairability,
          ifixit: null,
          stub: getRepairabilityStub(entry.brand),
          stub_url: buildIfixitSearchStubUrl(model_query),
        });
      }
    }

    let market_sell_price = entry.market_sell_price;
    let market_sell_price_source = entry.market_sell_price_source;

    if (entry.lock_market_price && entry.manual_market_sell_price !== null) {
      market_sell_price = entry.manual_market_sell_price;
      market_sell_price_source = "manual";
    } else if (!entry.lock_market_price) {
      market_sell_price = resolveStartingMarketPrice(entry.brand, entry.model_key);
      market_sell_price_source = "model_hint";
    }

    void upsertModelCache(
      entry.brand,
      entry.model_key,
      {
        repairability_score: repairability.repairability_score,
        repairability_scale: repairability.repairability_scale,
        ifixit_device_name: repairability.ifixit_device_name,
        ifixit_url: repairability.ifixit_url,
        avg_market_price: market_sell_price,
      },
      options.cache_ttl_hours,
    );

    for (let set_index = 0; set_index < CATALOG_PREFETCH_DAMAGE_SETS.length; set_index += 1) {
      const damage_types = CATALOG_PREFETCH_DAMAGE_SETS[set_index];
      options.on_progress?.({
        current_stage: "parts",
        current_source: include_allegro ? "allegro" : "parts",
        current_set_index: set_index + 1,
        current_set_total: CATALOG_PREFETCH_DAMAGE_SETS.length,
        wait_until_ms: null,
        wait_reason: null,
      });
      await fetchPartsData(
        entry.brand,
        model_query,
        entry.model_label,
        entry.model_key,
        damage_types,
        options.cache_ttl_hours,
        null,
        {
          include_allegro,
          antibot_wait_seconds: options.antibot_wait_seconds,
          antibot_retries: options.antibot_retries,
          on_progress: (progress) => {
            options.on_progress?.({
              current_stage: progress.stage,
              current_source: progress.source,
              current_set_index: set_index + 1,
              current_set_total: CATALOG_PREFETCH_DAMAGE_SETS.length,
              wait_until_ms: progress.wait_until_ms ?? null,
              wait_reason: progress.stage === "waiting_antibot" ? "antibot" : null,
            });
          },
        },
      );
      if (delay_ms > 0) await sleep(delay_ms);
    }

    options.on_progress?.({
      current_stage: "saving",
      wait_until_ms: null,
      wait_reason: null,
    });

    await updateCatalogEnrichmentResult(entry_id, {
      repairability_score: repairability.repairability_score,
      repairability_scale: repairability.repairability_scale,
      ifixit_device_name: repairability.ifixit_device_name,
      ifixit_url: repairability.ifixit_url,
      market_sell_price,
      market_sell_price_source,
      release_year,
      enrichment_status: "ready",
      last_enrichment_error: null,
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    enrich_log.warn("Ошибка обогащения каталога", { entry_id, message });
    options.on_progress?.({
      current_stage: "error",
      message,
      wait_until_ms: null,
    });
    await updateCatalogEnrichmentResult(entry_id, {
      enrichment_status: "error",
      last_enrichment_error: message,
    });
    return false;
  }
}
