export type PartSource = "allegro" | "olx" | "parts_store" | "ceneo" | "estimate";

export interface AllegroPart {
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  image: string | null;
  damage_type?: string;
  is_estimate?: boolean;
  source?: PartSource;
}

export interface AnalyzedDevice {
  id: number;
  title: string;
  olx_url: string;
  price_buy: number | null;
  price_currency: string | null;
  is_negotiable: boolean | null;
  brand: string;
  model_query: string;
  model_key: string;
  model_label: string;
  model_line: string;
  model_line_label: string;
  photos: string[];
  city: string | null;
  region: string | null;
  created_at: string;
  release_year: number | null;
  has_box: boolean;
  battery_health_percent: number | null;
  storage_gb: number | null;

  seller_name: string | null;
  seller_ads_count: number | null;
  seller_member_since: string | null;

  damage_types: string[];
  post_summary: string;

  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;

  allegro_parts: AllegroPart[];
  allegro_search_url: string | null;
  parts_cost_estimate: number | null;

  market_sell_price: number | null;
  market_sell_price_source: "model_median" | "cached_median" | "model_hint" | "brand_estimate" | null;
  profit_estimate: number | null;
  profitability_pct: number | null;

  liquidity_score: number | null;
  liquidity_label: string | null;

  is_favorite?: boolean;
  is_hidden?: boolean;

  last_analyzed_at: string;
}

export interface DevicesFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface BrandLineFilterGroup {
  line_value: string;
  line_label: string;
  line_count: number;
  models: DevicesFilterOption[];
}

export interface BrandFilterTreeNode {
  brand: string;
  label: string;
  count: number;
  lines: BrandLineFilterGroup[];
}

export interface DevicesFilterMeta {
  brand_options: DevicesFilterOption[];
  brand_tree: BrandFilterTreeNode[];
  models_by_brand: Record<string, DevicesFilterOption[]>;
  model_lines_by_brand: Record<string, DevicesFilterOption[]>;
  damage_type_counts: Record<string, number>;
  region_options: DevicesFilterOption[];
  price_bounds: [number, number];
  profitability_bounds: [number, number];
  year_bounds: [number, number];
}

export type ScanStage = "fetching_listings" | "analyzing" | "finalizing" | "saving";

export type MarketSellPriceSource = NonNullable<AnalyzedDevice["market_sell_price_source"]>;
