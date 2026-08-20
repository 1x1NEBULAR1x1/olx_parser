import { getModelLineSortKey } from "@/shared/lib/model-line-sort-key";
import { compareRecommendedRepair } from "@/shared/lib/recommended-repair-score";
import {
  DEFAULT_DEVICE_FEED_FILTERS,
  DEFAULT_DEVICE_SORT,
  DEVICE_SORT_OPTIONS,
  type DeviceFeedFilters,
  type DeviceSortKey,
} from "@/shared/types/filters";

export interface DeviceFeedItem {
  id: number;
  brand: string;
  model_key: string;
  model_label: string;
  model_line: string;
  damage_types: string[];
  region: string | null;
  price_buy: number | null;
  created_at: string;
  release_year: number | null;
  repairability_score: number | null;
  repairability_scale: number | null;
  liquidity_score: number | null;
  profit_estimate: number | null;
  profitability_pct: number | null;
  confidence_score: number | null;
  risk_adjusted_profit: number | null;
  risk_adjusted_profitability_pct: number | null;
  parts_cost_estimate: number | null;
}

export interface DeviceFeedPageQuery {
  offset: number;
  limit: number;
  sort: DeviceSortKey;
  filters: DeviceFeedFilters;
  include_meta: boolean;
}

const SORT_SET = new Set<string>(DEVICE_SORT_OPTIONS);

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseNumber(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRange(
  min_raw: string | null,
  max_raw: string | null,
): [number, number] | null {
  const min = parseNumber(min_raw);
  const max = parseNumber(max_raw);
  if (min === null || max === null) return null;
  return [min, max];
}

export function parseDeviceSortKey(value: string | null): DeviceSortKey {
  if (value && SORT_SET.has(value)) return value as DeviceSortKey;
  return DEFAULT_DEVICE_SORT;
}

export function parseDeviceFeedFilters(params: URLSearchParams): DeviceFeedFilters {
  const min_release_year = parseNumber(params.get("min_release_year"));
  return {
    brands: parseCsv(params.get("brands")),
    models: parseCsv(params.get("models")),
    model_lines: parseCsv(params.get("model_lines")),
    damage_types: parseCsv(params.get("damage_types")),
    regions: parseCsv(params.get("regions")),
    price_range: parseRange(params.get("price_min"), params.get("price_max")),
    min_repairability: params.get("min_repairability") ?? "",
    profitability_range: parseRange(params.get("profitability_min"), params.get("profitability_max")),
    liquidity_range: parseRange(params.get("liquidity_min"), params.get("liquidity_max")),
    min_release_year,
  };
}

export function parseDeviceFeedPageQuery(
  params: URLSearchParams,
  defaults: { offset: number; limit: number },
): DeviceFeedPageQuery {
  const page = parseNumber(params.get("page"));
  const requested_limit = parseNumber(params.get("limit")) ?? defaults.limit;
  const limit = Math.min(Math.max(requested_limit, 1), 200);
  const offset_from_page = page !== null && page >= 1 ? (page - 1) * limit : null;
  const offset = offset_from_page ?? Math.max(parseNumber(params.get("offset")) ?? defaults.offset, 0);

  return {
    offset,
    limit,
    sort: parseDeviceSortKey(params.get("sort")),
    filters: parseDeviceFeedFilters(params),
    include_meta: params.get("meta") === "1",
  };
}

export function appendDeviceFeedQuery(
  search: URLSearchParams,
  query: Partial<DeviceFeedPageQuery> & { filters?: DeviceFeedFilters },
): void {
  const filters = query.filters ?? DEFAULT_DEVICE_FEED_FILTERS;
  if (query.offset !== undefined) search.set("offset", String(query.offset));
  if (query.limit !== undefined) search.set("limit", String(query.limit));
  if (query.sort) search.set("sort", query.sort);
  if (query.include_meta) search.set("meta", "1");
  if (filters.brands.length) search.set("brands", filters.brands.join(","));
  if (filters.models.length) search.set("models", filters.models.join(","));
  if (filters.model_lines.length) search.set("model_lines", filters.model_lines.join(","));
  if (filters.damage_types.length) search.set("damage_types", filters.damage_types.join(","));
  if (filters.regions.length) search.set("regions", filters.regions.join(","));
  if (filters.price_range) {
    search.set("price_min", String(filters.price_range[0]));
    search.set("price_max", String(filters.price_range[1]));
  }
  if (filters.min_repairability) search.set("min_repairability", filters.min_repairability);
  if (filters.profitability_range) {
    search.set("profitability_min", String(filters.profitability_range[0]));
    search.set("profitability_max", String(filters.profitability_range[1]));
  }
  if (filters.liquidity_range) {
    search.set("liquidity_min", String(filters.liquidity_range[0]));
    search.set("liquidity_max", String(filters.liquidity_range[1]));
  }
  if (filters.min_release_year !== null) {
    search.set("min_release_year", String(filters.min_release_year));
  }
}

export function filterDeviceFeed<T extends DeviceFeedItem>(
  devices: T[],
  filters: DeviceFeedFilters,
): T[] {
  return devices.filter((device) => {
    if (filters.models.length > 0) {
      if (!filters.models.includes(device.model_key)) return false;
    } else if (filters.model_lines.length > 0) {
      if (!filters.model_lines.includes(device.model_line)) return false;
    }
    if (filters.brands.length > 0 && !filters.brands.includes(device.brand)) return false;
    if (filters.damage_types.length > 0 && !filters.damage_types.some((dt) => device.damage_types.includes(dt))) {
      return false;
    }
    if (filters.regions.length > 0 && (!device.region || !filters.regions.includes(device.region))) {
      return false;
    }

    if (filters.price_range) {
      const [min, max] = filters.price_range;
      if ((device.price_buy ?? 0) < min || (device.price_buy ?? 0) > max) return false;
    }

    if (filters.min_repairability) {
      const score = device.repairability_score !== null && device.repairability_scale
        ? (device.repairability_score / device.repairability_scale) * 10
        : null;
      if (score === null || score < Number(filters.min_repairability)) return false;
    }

    if (filters.profitability_range) {
      const [min, max] = filters.profitability_range;
      if ((device.profitability_pct ?? -999) < min || (device.profitability_pct ?? 999) > max) return false;
    }

    if (filters.liquidity_range) {
      const [min, max] = filters.liquidity_range;
      if ((device.liquidity_score ?? -1) < min || (device.liquidity_score ?? 999) > max) return false;
    }

    if (filters.min_release_year !== null) {
      if (device.release_year === null || device.release_year < filters.min_release_year) return false;
    }

    return true;
  });
}

export function sortDeviceFeed<T extends DeviceFeedItem>(devices: T[], sort: DeviceSortKey): T[] {
  return [...devices].sort((a, b) => {
    switch (sort) {
      case "recommended_repair": return compareRecommendedRepair(a, b);
      case "profitability_desc": return (b.profitability_pct ?? -999) - (a.profitability_pct ?? -999);
      case "profitability_asc": return (a.profitability_pct ?? 999) - (b.profitability_pct ?? 999);
      case "price_asc": return (a.price_buy ?? 999999) - (b.price_buy ?? 999999);
      case "price_desc": return (b.price_buy ?? 0) - (a.price_buy ?? 0);
      case "repairability_desc": return (b.repairability_score ?? 0) - (a.repairability_score ?? 0);
      case "liquidity_desc": return (b.liquidity_score ?? 0) - (a.liquidity_score ?? 0);
      case "newest": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "release_year_desc": return (b.release_year ?? 0) - (a.release_year ?? 0);
      case "model_line": {
        const brand_cmp = a.brand.localeCompare(b.brand);
        if (brand_cmp !== 0) return brand_cmp;
        const line_cmp = getModelLineSortKey(a.model_line) - getModelLineSortKey(b.model_line);
        if (line_cmp !== 0) return line_cmp;
        return (a.model_label || a.model_key).localeCompare(b.model_label || b.model_key);
      }
      default: return 0;
    }
  });
}

export function paginateDeviceFeed<T>(items: T[], offset: number, limit: number): {
  items: T[];
  total_count: number;
  has_more: boolean;
} {
  const safe_offset = Math.max(0, offset);
  const safe_limit = Math.max(1, limit);
  const sliced = items.slice(safe_offset, safe_offset + safe_limit);
  return {
    items: sliced,
    total_count: items.length,
    has_more: safe_offset + sliced.length < items.length,
  };
}
