import { getLatestDevices, getAppSettings, upsertPartsCostCache } from "@/server/repositories/devices-repository";
import { fetchPartsStoreParts } from "@/server/fetchers/parts-store-fetcher";
import { PART_SEARCH_KEYWORDS } from "@/server/domain/static-parts-prices";
import { createLogger } from "@/server/shared/logger";
import { config } from "@/server/shared/config";
import type { AllegroPart } from "@/shared/types/domain";

const prefetch_log = createLogger("parts-store-prefetch");

export interface PartsStorePrefetchItem {
  brand: string;
  model_key: string;
  model_label: string;
  model_query: string;
  damage_types: string[];
  damage_signature: string;
  parts: AllegroPart[];
  search_url: string | null;
}

export interface PartsStorePrefetchStats {
  total_models: number;
  processed: number;
  cached: number;
  with_parts: number;
  skipped: number;
  errors: number;
  export_path: string | null;
}

interface PrefetchOptions {
  chunk_size?: number;
  chunk_delay_ms?: number;
  export_path?: string;
  force_refresh?: boolean;
}

function buildDamageSignature(damage_types: string[]): string {
  return [...damage_types].sort().join(",");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Чанковая выгрузка цен parts-store.pl для всех уникальных
 * (brand, model_key, damage_types) из текущей базы Device.
 * Результат пишется в PartsCostCache и опционально в JSON-файл.
 */
export async function prefetchPartsStoreCatalog(
  options: PrefetchOptions = {},
): Promise<{ items: PartsStorePrefetchItem[]; stats: PartsStorePrefetchStats }> {
  const chunk_size = options.chunk_size ?? config.pipeline.parts_store_prefetch_chunk_size;
  const chunk_delay_ms = options.chunk_delay_ms ?? config.pipeline.parts_store_prefetch_chunk_delay_ms;
  const export_path = options.export_path;

  const { devices } = await getLatestDevices();
  const settings = await getAppSettings();
  const cache_ttl_hours = settings.cache_ttl_hours;

  const unique_map = new Map<string, {
    brand: string;
    model_key: string;
    model_label: string;
    model_query: string;
    damage_types: string[];
  }>();

  for (const device of devices) {
    if (device.damage_types.length === 0) continue;
    const signature = buildDamageSignature(device.damage_types);
    const key = `${device.brand}::${device.model_key}::${signature}`;
    if (!unique_map.has(key)) {
      unique_map.set(key, {
        brand: device.brand,
        model_key: device.model_key,
        model_label: device.model_label,
        model_query: device.model_query,
        damage_types: [...device.damage_types],
      });
    }
  }

  const entries = [...unique_map.values()];
  const items: PartsStorePrefetchItem[] = [];

  const stats: PartsStorePrefetchStats = {
    total_models: entries.length,
    processed: 0,
    cached: 0,
    with_parts: 0,
    skipped: 0,
    errors: 0,
    export_path: export_path ?? null,
  };

  prefetch_log.info("Старт prefetch parts-store", {
    models: entries.length,
    chunk_size,
    chunk_delay_ms,
  });

  for (let offset = 0; offset < entries.length; offset += chunk_size) {
    const chunk = entries.slice(offset, offset + chunk_size);

    for (const entry of chunk) {
      const damage_signature = buildDamageSignature(entry.damage_types);
      const model_short = entry.model_query.split(" ").slice(0, 3).join(" ");

      try {
        const parts_by_type = await Promise.all(
          entry.damage_types.map(async (damage_type) => {
            const keyword = PART_SEARCH_KEYWORDS[damage_type];
            if (!keyword) return [] as AllegroPart[];
            const result = await fetchPartsStoreParts(
              entry.brand,
              model_short,
              damage_type,
              keyword,
              config.pipeline.allegro_parts_per_model,
            );
            return result.parts.map((part) => ({
              ...part,
              damage_type,
              source: "parts_store" as const,
            }));
          }),
        );

        const parts = parts_by_type.flat();
        const search_url = parts[0]?.url
          ? `https://parts-store.pl/search.php?text=${encodeURIComponent(`${entry.brand} ${model_short}`)}`
          : null;

        const cache_entry = { parts, search_url };
        await upsertPartsCostCache(
          entry.brand,
          entry.model_key,
          damage_signature,
          cache_entry,
          cache_ttl_hours,
        );

        items.push({
          brand: entry.brand,
          model_key: entry.model_key,
          model_label: entry.model_label,
          model_query: entry.model_query,
          damage_types: entry.damage_types,
          damage_signature,
          parts,
          search_url,
        });

        stats.processed += 1;
        stats.cached += 1;
        if (parts.length > 0) stats.with_parts += 1;
      } catch (error) {
        stats.errors += 1;
        prefetch_log.warn("Ошибка prefetch модели", {
          brand: entry.brand,
          model_key: entry.model_key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    prefetch_log.info("Чанк prefetch завершён", {
      offset,
      chunk: chunk.length,
      processed: stats.processed,
      total: entries.length,
    });

    if (offset + chunk_size < entries.length) {
      await sleep(chunk_delay_ms);
    }
  }

  if (export_path) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.dirname(export_path), { recursive: true });
    await fs.writeFile(
      export_path,
      JSON.stringify({ exported_at: new Date().toISOString(), stats, items }, null, 2),
      "utf8",
    );
    prefetch_log.info("JSON экспорт записан", { export_path, items: items.length });
  }

  prefetch_log.info("Prefetch parts-store завершён", { ...stats });
  return { items, stats };
}
