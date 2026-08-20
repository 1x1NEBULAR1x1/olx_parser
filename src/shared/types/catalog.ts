/** Типовые наборы повреждений для предзагрузки цен запчастей в каталог. */
export const CATALOG_PREFETCH_DAMAGE_SETS: string[][] = [
  ["screen"],
  ["battery"],
  ["back_cover"],
  ["charging_port"],
  ["camera"],
  ["buttons"],
  ["screen", "battery"],
  ["screen", "back_cover"],
];

/** Польские источники запчастей (приоритет в parts-rank.ts). */
export const POLISH_PARTS_SOURCES = [
  "allegro",
  "ceneo",
  "parts_store",
  "shop",
  "olx",
] as const;

export type CatalogEnrichmentStatus = "pending" | "enriching" | "ready" | "stale" | "error";

export interface DeviceCatalogRow {
  id: number;
  brand: string;
  model_key: string;
  model_label: string;
  model_line: string;
  model_line_label: string;
  model_query: string;
  release_year: number | null;
  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;
  market_sell_price: number | null;
  market_sell_price_source: string | null;
  manual_repairability_score: number | null;
  manual_repairability_scale: number | null;
  manual_market_sell_price: number | null;
  manual_storage_prices: Record<string, number> | null;
  manual_repair_complexity_pct: number | null;
  lock_repairability: boolean;
  lock_market_price: boolean;
  notes: string | null;
  enrichment_status: CatalogEnrichmentStatus;
  last_enriched_at: string | null;
  last_enrichment_error: string | null;
  listings_seen_count: number;
}

export type CatalogJobStage =
  | "idle"
  | "repairability"
  | "parts"
  | "waiting_antibot"
  | "saving"
  | "done"
  | "error";

export interface CatalogLiveProgress {
  is_running: boolean;
  run_id: string | null;
  processed_models: number;
  total_models: number;
  current_entry_id: number | null;
  current_brand: string | null;
  current_model_label: string | null;
  current_stage: CatalogJobStage;
  current_source: string | null;
  current_set_index: number | null;
  current_set_total: number | null;
  wait_until_ms: number | null;
  wait_reason: string | null;
  message: string | null;
}

export interface CatalogManualJobProgress {
  entry_id: number;
  is_running: boolean;
  sources: string[];
  current_source: string | null;
  stage: CatalogJobStage;
  set_index: number;
  set_total: number;
  damage_set: string | null;
  wait_until_ms: number | null;
  wait_reason: string | null;
  message: string | null;
  error: string | null;
  parts_found: number;
}

export interface CatalogEnrichmentStatusResponse {
  is_running: boolean;
  run_id: string | null;
  status: string | null;
  total_models: number;
  processed_models: number;
  percent: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  current_entry_id: number | null;
  current_brand: string | null;
  current_model_label: string | null;
  current_stage: CatalogJobStage;
  current_source: string | null;
  current_set_index: number | null;
  current_set_total: number | null;
  wait_until_ms: number | null;
  wait_reason: string | null;
  message: string | null;
  manual_jobs: CatalogManualJobProgress[];
  cursor: string;
  timed_out?: boolean;
}

export interface CatalogProgressSnapshot {
  is_running: boolean;
  run_id: string | null;
  processed_models: number;
  total_models: number;
  current_entry_id: number | null;
  current_brand: string | null;
  current_model_label: string | null;
  current_stage: CatalogJobStage;
  current_source: string | null;
  current_set_index: number | null;
  current_set_total: number | null;
  wait_until_ms: number | null;
  wait_reason: string | null;
  message: string | null;
  manual_jobs: CatalogManualJobProgress[];
}

export interface CatalogModelLineOption {
  value: string;
  label: string;
}

export interface CatalogStorageStat {
  storage_gb: number;
  listing_count: number;
  median_buy: number | null;
  hint_price: number | null;
  manual_price: number | null;
}

export interface CatalogPartsCacheRow {
  damage_signature: string;
  parts_cost_estimate: number | null;
  allegro_search_url: string | null;
  parts: Array<{
    title: string;
    price: number | null;
    currency: string | null;
    url: string;
    image: string | null;
    damage_type?: string;
    source?: string;
  }>;
  fetched_at: string;
  expires_at: string;
}

export interface CatalogNeighborInfo {
  prev_id: number | null;
  next_id: number | null;
  index: number;
  total: number;
}

export interface DeviceCatalogDetailResponse {
  item: DeviceCatalogRow;
  storage_stats: CatalogStorageStat[];
  parts_caches: CatalogPartsCacheRow[];
  brands: string[];
  neighbors: CatalogNeighborInfo;
}

export interface DeviceCatalogListResponse {
  items: DeviceCatalogRow[];
  total_count: number;
  brands: string[];
  model_lines: CatalogModelLineOption[];
}

export interface DeviceCatalogIdsResponse {
  entry_ids: number[];
  total_count: number;
}

export interface DeviceCatalogPatch {
  manual_repairability_score?: number | null;
  manual_repairability_scale?: number | null;
  manual_market_sell_price?: number | null;
  manual_storage_prices?: Record<string, number> | null;
  manual_repair_complexity_pct?: number | null;
  lock_repairability?: boolean;
  lock_market_price?: boolean;
  notes?: string | null;
  enrichment_status?: CatalogEnrichmentStatus;
}

export type ManualPartsSource = "allegro" | "olx" | "parts_store" | "ceneo" | "shop" | "all";

export interface ManualPartsFetchRequest {
  sources?: ManualPartsSource[];
  use_default_damage_sets?: boolean;
  damage_types_sets?: string[][];
}

export interface ManualPartsFetchResponse {
  entry_id: number;
  brand: string;
  model_key: string;
  damage_sets_processed: number;
  parts_found: number;
  sources_used: string[];
}
