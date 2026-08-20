import { fetchPartsData } from "@/server/scan/parts-chain";
import { getCatalogEntryById } from "@/server/repositories/catalog-repository";
import { getAppSettings } from "@/server/repositories/devices-repository";
import { isPartEstimate } from "@/server/domain/repair-parts-stubs";
import {
  finishCatalogManualJob,
  patchCatalogManualJob,
  startCatalogManualJob,
} from "@/server/catalog/catalog-job-progress";
import {
  CATALOG_PREFETCH_DAMAGE_SETS,
  type ManualPartsFetchResponse,
  type ManualPartsSource,
} from "@/shared/types/catalog";
import type { PartSource } from "@/shared/types/domain";
import { createLogger } from "@/server/shared/logger";

const manual_parts_log = createLogger("manual-parts");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveManualSources(sources: ManualPartsSource[] | undefined): PartSource[] {
  if (!sources?.length) {
    return ["allegro"];
  }

  if (sources.includes("all")) {
    return ["allegro", "ceneo", "parts_store", "shop", "olx"];
  }

  const resolved: PartSource[] = [];
  for (const source of sources) {
    if (source === "all") continue;
    if (source === "shop") {
      resolved.push("parts_store", "shop");
      continue;
    }
    resolved.push(source);
  }
  return [...new Set(resolved)];
}

export async function fetchPartsForCatalogEntry(
  entry_id: number,
  cache_ttl_hours: number,
  body: {
    sources?: ManualPartsSource[];
    use_default_damage_sets?: boolean;
    damage_types_sets?: string[][];
    delay_ms?: number;
  },
): Promise<ManualPartsFetchResponse | null> {
  const entry = await getCatalogEntryById(entry_id);
  if (!entry) return null;

  const settings = await getAppSettings();
  const model_query = entry.model_query || entry.model_label || entry.model_key;
  const manual_sources = resolveManualSources(body.sources);
  const damage_sets = body.use_default_damage_sets !== false
    ? CATALOG_PREFETCH_DAMAGE_SETS
    : (body.damage_types_sets ?? CATALOG_PREFETCH_DAMAGE_SETS);
  const delay_ms = body.delay_ms ?? settings.catalog_source_delay_ms ?? 600;

  let parts_found = 0;
  const sources_used = new Set<string>();

  startCatalogManualJob({
    entry_id,
    is_running: true,
    sources: manual_sources,
    current_source: manual_sources[0] ?? null,
    stage: "parts",
    set_index: 0,
    set_total: damage_sets.length,
    damage_set: null,
    wait_until_ms: null,
    wait_reason: null,
    message: null,
    error: null,
    parts_found: 0,
  });

  manual_parts_log.info("Ручная загрузка цен запчастей", {
    entry_id,
    brand: entry.brand,
    model_key: entry.model_key,
    sources: manual_sources,
    damage_sets: damage_sets.length,
  });

  try {
    for (let set_index = 0; set_index < damage_sets.length; set_index += 1) {
      const damage_types = damage_sets[set_index];
      patchCatalogManualJob(entry_id, {
        stage: "parts",
        set_index: set_index + 1,
        set_total: damage_sets.length,
        damage_set: damage_types.join(","),
        current_source: manual_sources[0] ?? null,
        wait_until_ms: null,
        wait_reason: null,
      });

      const result = await fetchPartsData(
        entry.brand,
        model_query,
        entry.model_label,
        entry.model_key,
        damage_types,
        cache_ttl_hours,
        null,
        {
          manual_sources,
          force_refresh: true,
          merge_existing: !body.sources?.includes("all"),
          antibot_wait_seconds: settings.catalog_antibot_wait_seconds,
          antibot_retries: settings.catalog_antibot_retries,
          on_progress: (progress) => {
            patchCatalogManualJob(entry_id, {
              stage: progress.stage,
              current_source: progress.source,
              wait_until_ms: progress.wait_until_ms ?? null,
              wait_reason: progress.stage === "waiting_antibot" ? "antibot" : null,
            });
          },
        },
      );

      for (const part of result.parts) {
        if (!isPartEstimate(part) && part.source) {
          sources_used.add(part.source);
          parts_found += 1;
        }
      }

      patchCatalogManualJob(entry_id, { parts_found });
      if (delay_ms > 0) await sleep(delay_ms);
    }

    finishCatalogManualJob(entry_id, {
      stage: "done",
      parts_found,
      message: null,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishCatalogManualJob(entry_id, {
      stage: "error",
      error: message,
      parts_found,
    });
    manual_parts_log.warn("Ручная загрузка прервана", { entry_id, message });
  }

  return {
    entry_id,
    brand: entry.brand,
    model_key: entry.model_key,
    damage_sets_processed: damage_sets.length,
    parts_found,
    sources_used: Array.from(sources_used),
  };
}
