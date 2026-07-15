import type { AnalyzedDevice } from "@/shared/api/client";
import { compareRecommendedRepair } from "@/entities/device/lib/recommended-repair-score";
import { getModelLineSortKey } from "@/shared/lib/model-line-sort-key";
import type { FilterValues } from "@/features/device-filter/model/filter-values";

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

export function sortDevices(devices: AnalyzedDevice[], sort: DeviceSortKey): AnalyzedDevice[] {
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

export function filterDevices(devices: AnalyzedDevice[], filters: FilterValues): AnalyzedDevice[] {
  return devices.filter((d) => {
    if (filters.brands.length > 0 && !filters.brands.includes(d.brand)) return false;
    if (filters.models.length > 0 && !filters.models.includes(d.model_key)) return false;
    if (filters.model_lines.length > 0 && !filters.model_lines.includes(d.model_line)) return false;
    if (filters.damage_types.length > 0 && !filters.damage_types.some((dt) => d.damage_types.includes(dt))) return false;
    if (filters.regions.length > 0 && (!d.region || !filters.regions.includes(d.region))) return false;

    if (filters.price_range) {
      const [min, max] = filters.price_range;
      if ((d.price_buy ?? 0) < min || (d.price_buy ?? 0) > max) return false;
    }

    if (filters.min_repairability) {
      const score = d.repairability_score !== null && d.repairability_scale
        ? (d.repairability_score / d.repairability_scale) * 10
        : null;
      if (score === null || score < Number(filters.min_repairability)) return false;
    }

    if (filters.profitability_range) {
      const [min, max] = filters.profitability_range;
      if ((d.profitability_pct ?? -999) < min || (d.profitability_pct ?? 999) > max) return false;
    }

    if (filters.liquidity_range) {
      const [min, max] = filters.liquidity_range;
      if ((d.liquidity_score ?? -1) < min || (d.liquidity_score ?? 999) > max) return false;
    }

    if (filters.min_release_year !== null) {
      if (d.release_year === null || d.release_year < filters.min_release_year) return false;
    }

    return true;
  });
}
