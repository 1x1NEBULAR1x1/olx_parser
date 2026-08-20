import { getCatalogEntryByKey, listAllCatalogEntries } from "@/server/repositories/catalog-repository";
import { adjustPriceForStorage, resolveStartingMarketPrice } from "@/server/domain/model-market-price-hints";
import type { DeviceCatalogRow } from "@/shared/types/catalog";

export interface CatalogRepairabilitySnapshot {
  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;
  release_year: number | null;
  from_catalog: boolean;
}

export interface CatalogMarketPriceSnapshot {
  market_sell_price: number | null;
  market_sell_price_source: string | null;
  manual_repair_complexity_pct: number | null;
  storage_prices: Record<string, number> | null;
  from_catalog: boolean;
}

export function catalogRepairabilityFromRow(entry: DeviceCatalogRow): CatalogRepairabilitySnapshot | null {
  if (entry.enrichment_status !== "ready") return null;

  if (entry.lock_repairability && entry.manual_repairability_score !== null) {
    return {
      repairability_score: entry.manual_repairability_score,
      repairability_scale: entry.manual_repairability_scale,
      ifixit_device_name: entry.ifixit_device_name,
      ifixit_url: entry.ifixit_url,
      release_year: entry.release_year,
      from_catalog: true,
    };
  }

  if (entry.repairability_score !== null || entry.ifixit_device_name !== null) {
    return {
      repairability_score: entry.repairability_score,
      repairability_scale: entry.repairability_scale,
      ifixit_device_name: entry.ifixit_device_name,
      ifixit_url: entry.ifixit_url,
      release_year: entry.release_year,
      from_catalog: true,
    };
  }

  return null;
}

export function catalogMarketPriceFromRow(entry: DeviceCatalogRow): CatalogMarketPriceSnapshot {
  const has_manual = entry.lock_market_price && (
    entry.manual_market_sell_price !== null || Boolean(entry.manual_storage_prices)
  );
  if (has_manual) {
    return {
      market_sell_price: entry.manual_market_sell_price,
      market_sell_price_source: "manual",
      manual_repair_complexity_pct: entry.manual_repair_complexity_pct,
      storage_prices: entry.manual_storage_prices,
      from_catalog: true,
    };
  }

  if (entry.market_sell_price !== null) {
    return {
      market_sell_price: entry.market_sell_price,
      market_sell_price_source: entry.market_sell_price_source ?? "model_hint",
      manual_repair_complexity_pct: entry.manual_repair_complexity_pct,
      storage_prices: entry.manual_storage_prices,
      from_catalog: true,
    };
  }

  return {
    market_sell_price: resolveStartingMarketPrice(entry.brand, entry.model_key),
    market_sell_price_source: "model_hint",
    manual_repair_complexity_pct: entry.manual_repair_complexity_pct,
    storage_prices: entry.manual_storage_prices,
    from_catalog: true,
  };
}

export async function getCatalogRepairability(
  brand: string,
  model_key: string,
): Promise<CatalogRepairabilitySnapshot | null> {
  const entry = await getCatalogEntryByKey(brand, model_key);
  if (!entry) return null;
  return catalogRepairabilityFromRow(entry);
}

export async function getCatalogMarketPrice(
  brand: string,
  model_key: string,
): Promise<CatalogMarketPriceSnapshot | null> {
  const entry = await getCatalogEntryByKey(brand, model_key);
  if (!entry) return null;
  return catalogMarketPriceFromRow(entry);
}

export interface CatalogLookup {
  getRepairability: (brand: string, model_key: string) => CatalogRepairabilitySnapshot | null;
  getMarketPrice: (brand: string, model_key: string) => CatalogMarketPriceSnapshot | null;
}

export function buildCatalogLookup(entries: DeviceCatalogRow[]): CatalogLookup {
  const repairability = new Map<string, CatalogRepairabilitySnapshot>();
  const market = new Map<string, CatalogMarketPriceSnapshot>();
  for (const entry of entries) {
    const key = `${entry.brand}::${entry.model_key}`;
    const repair = catalogRepairabilityFromRow(entry);
    if (repair) repairability.set(key, repair);
    market.set(key, catalogMarketPriceFromRow(entry));
  }
  return {
    getRepairability: (brand, model_key) => repairability.get(`${brand}::${model_key}`) ?? null,
    getMarketPrice: (brand, model_key) => market.get(`${brand}::${model_key}`) ?? null,
  };
}

export async function loadCatalogLookup(): Promise<CatalogLookup> {
  const entries = await listAllCatalogEntries();
  return buildCatalogLookup(entries);
}

export function resolveCatalogSellPrice(
  snapshot: CatalogMarketPriceSnapshot | null,
  storage_gb: number | null,
): number | null {
  if (!snapshot) return null;
  if (storage_gb !== null && snapshot.storage_prices) {
    const exact = snapshot.storage_prices[String(storage_gb)];
    if (typeof exact === "number" && exact > 0) return exact;
  }
  if (snapshot.market_sell_price === null) return null;
  return adjustPriceForStorage(snapshot.market_sell_price, storage_gb);
}
