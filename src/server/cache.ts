import NodeCache from "node-cache";
import { config } from "./config";
import type { AllegroPart } from "./types";

const ifixit_cache = new NodeCache({ stdTTL: config.cache.ifixit_repairability_ttl_sec, useClones: false });
const allegro_cache = new NodeCache({ stdTTL: config.cache.allegro_parts_ttl_sec, useClones: false });

export interface IfixitCacheEntry {
  repairability_score: number | null;
  repairability_scale: number | null;
  device_name: string | null;
  device_url: string | null;
}

export function getIfixitCache(device_query: string): IfixitCacheEntry | undefined {
  return ifixit_cache.get<IfixitCacheEntry>(device_query);
}

export function setIfixitCache(device_query: string, entry: IfixitCacheEntry): void {
  ifixit_cache.set(device_query, entry);
}

export interface AllegroPartsCacheEntry {
  parts: AllegroPart[];
  search_url: string | null;
}

// Ключ ОБЯЗАТЕЛЬНО включает damage_types: раньше ключ был `${brand}::${model_query}`
// без учёта повреждений, из-за чего объявление A (повреждённое, "Galaxy A54",
// закэшировавшее реальные запчасти) и объявление B той же модели БЕЗ
// повреждений получали ОДИН И ТОТ ЖЕ кэш-хит — B показывало запчасти для
// ремонта, которого не требовалось. Сортировка типов делает ключ стабильным
// независимо от порядка damage_types на входе.
function buildPartsKey(brand: string, model_query: string, damage_types: string[]): string {
  const damage_signature = [...damage_types].sort().join(",");
  return `${brand}::${model_query}::${damage_signature}`;
}

export function getAllegroCache(
  brand: string,
  model_query: string,
  damage_types: string[],
): AllegroPartsCacheEntry | undefined {
  return allegro_cache.get<AllegroPartsCacheEntry>(buildPartsKey(brand, model_query, damage_types));
}

export function setAllegroCache(
  brand: string,
  model_query: string,
  damage_types: string[],
  entry: AllegroPartsCacheEntry,
): void {
  allegro_cache.set(buildPartsKey(brand, model_query, damage_types), entry);
}
