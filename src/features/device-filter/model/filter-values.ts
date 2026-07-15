export interface FilterValues {
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

export const DEFAULT_FILTERS: FilterValues = {
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

export function isFilterBarEmpty(filters: FilterValues): boolean {
  return (
    filters.brands.length === 0 &&
    filters.models.length === 0 &&
    filters.model_lines.length === 0 &&
    filters.damage_types.length === 0 &&
    filters.regions.length === 0 &&
    filters.price_range === null &&
    filters.min_repairability === "" &&
    filters.profitability_range === null &&
    filters.liquidity_range === null &&
    filters.min_release_year === null
  );
}
