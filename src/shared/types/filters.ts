export type DeviceSortKey =
  | "recommended_repair"
  | "profitability_desc"
  | "profitability_asc"
  | "price_asc"
  | "price_desc"
  | "repairability_desc"
  | "liquidity_desc"
  | "newest"
  | "release_year_desc"
  | "model_line";

export const DEVICE_SORT_OPTIONS: DeviceSortKey[] = [
  "recommended_repair",
  "profitability_desc",
  "profitability_asc",
  "price_asc",
  "price_desc",
  "repairability_desc",
  "liquidity_desc",
  "newest",
  "release_year_desc",
  "model_line",
];

export const DEFAULT_DEVICE_SORT: DeviceSortKey = "recommended_repair";

export interface DeviceFeedFilters {
  brands: string[];
  models: string[];
  model_lines: string[];
  damage_types: string[];
  regions: string[];
  price_range: [number, number] | null;
  min_repairability: string;
  profitability_range: [number, number] | null;
  liquidity_range: [number, number] | null;
  min_release_year: number | null;
}

export const DEFAULT_DEVICE_FEED_FILTERS: DeviceFeedFilters = {
  brands: [],
  models: [],
  model_lines: [],
  damage_types: [],
  regions: [],
  price_range: null,
  min_repairability: "",
  profitability_range: null,
  liquidity_range: null,
  min_release_year: null,
};

export function isDeviceFeedFiltersEmpty(filters: DeviceFeedFilters): boolean {
  return (
    filters.brands.length === 0
    && filters.models.length === 0
    && filters.model_lines.length === 0
    && filters.damage_types.length === 0
    && filters.regions.length === 0
    && filters.price_range === null
    && filters.min_repairability === ""
    && filters.profitability_range === null
    && filters.liquidity_range === null
    && filters.min_release_year === null
  );
}
