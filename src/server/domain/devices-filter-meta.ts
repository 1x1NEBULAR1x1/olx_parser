import { getModelLineSortKey } from "@/server/domain/model-line-extractor";
import { getModelVersionSortKey } from "./model-sort-key";
import type { BrandFilterTreeNode, BrandLineFilterGroup, DevicesFilterMeta } from "@/shared/types/domain";

const UNGROUPED_LINE_KEY = "";

export interface DeviceFilterRow {
  brand: string;
  model_key: string;
  model_label: string;
  model_line: string;
  model_line_label: string;
  damage_types: string;
  region: string | null;
  price_buy: number | null;
  profitability_pct: number | null;
  liquidity_score: number | null;
  release_year: number | null;
}

function buildBounds(values: number[], fallback: [number, number]): [number, number] {
  if (values.length === 0) return fallback;
  return [Math.min(...values), Math.max(...values)];
}

const DEFAULT_YEAR_BOUNDS: [number, number] = [2014, new Date().getFullYear()];

function buildBrandTree(
  brand_options: DevicesFilterMeta["brand_options"],
  models_by_brand: DevicesFilterMeta["models_by_brand"],
  model_line_by_model_by_brand: Record<string, Record<string, { line_value: string; line_label: string }>>,
): BrandFilterTreeNode[] {
  return brand_options.map((brand_option) => {
    const brand_models = models_by_brand[brand_option.value] ?? [];
    const line_groups = new Map<string, BrandLineFilterGroup>();

    for (const model of brand_models) {
      const line_info = model_line_by_model_by_brand[brand_option.value]?.[model.value];
      const line_value = line_info?.line_value ?? UNGROUPED_LINE_KEY;
      const line_label = line_info?.line_label ?? "";

      const existing_group = line_groups.get(line_value);
      if (existing_group) {
        existing_group.models.push(model);
        existing_group.line_count += model.count;
      } else {
        line_groups.set(line_value, {
          line_value,
          line_label,
          line_count: model.count,
          models: [model],
        });
      }
    }

    const lines = Array.from(line_groups.values()).sort((a, b) => {
      if (!a.line_value) return 1;
      if (!b.line_value) return -1;
      return getModelLineSortKey(a.line_value) - getModelLineSortKey(b.line_value);
    });

    return {
      brand: brand_option.value,
      label: brand_option.label,
      count: brand_option.count,
      lines,
    };
  });
}

export function buildDevicesFilterMeta(rows: DeviceFilterRow[]): DevicesFilterMeta {
  const brand_counts: Record<string, number> = {};
  const models_by_brand: DevicesFilterMeta["models_by_brand"] = {};
  const model_lines_by_brand: DevicesFilterMeta["model_lines_by_brand"] = {};
  const model_line_by_model_by_brand: Record<string, Record<string, { line_value: string; line_label: string }>> = {};
  const damage_type_counts: Record<string, number> = {};
  const region_counts: Record<string, number> = {};
  const prices: number[] = [];
  const profitability_values: number[] = [];
  const release_years: number[] = [];

  for (const row of rows) {
    if (row.brand !== "unknown") {
      brand_counts[row.brand] = (brand_counts[row.brand] ?? 0) + 1;
    }

    if (row.brand !== "unknown" && row.model_key) {
      const brand_models = models_by_brand[row.brand] ?? (models_by_brand[row.brand] = []);
      const existing_model = brand_models.find((item) => item.value === row.model_key);
      if (existing_model) {
        existing_model.count += 1;
      } else {
        brand_models.push({
          value: row.model_key,
          label: row.model_label || row.model_key,
          count: 1,
        });
      }

      if (row.model_line) {
        const brand_model_lines = model_line_by_model_by_brand[row.brand]
          ?? (model_line_by_model_by_brand[row.brand] = {});
        if (!brand_model_lines[row.model_key]) {
          brand_model_lines[row.model_key] = {
            line_value: row.model_line,
            line_label: row.model_line_label || row.model_line,
          };
        }
      }
    }

    if (row.brand !== "unknown" && row.model_line) {
      const brand_lines = model_lines_by_brand[row.brand] ?? (model_lines_by_brand[row.brand] = []);
      const existing_line = brand_lines.find((item) => item.value === row.model_line);
      if (existing_line) {
        existing_line.count += 1;
      } else {
        brand_lines.push({
          value: row.model_line,
          label: row.model_line_label || row.model_line,
          count: 1,
        });
      }
    }

    const damage_types = JSON.parse(row.damage_types) as string[];
    for (const damage_type of damage_types) {
      damage_type_counts[damage_type] = (damage_type_counts[damage_type] ?? 0) + 1;
    }

    if (row.region) {
      region_counts[row.region] = (region_counts[row.region] ?? 0) + 1;
    }

    if (row.price_buy !== null) prices.push(row.price_buy);
    if (row.profitability_pct !== null) profitability_values.push(row.profitability_pct);
    if (row.release_year !== null) release_years.push(row.release_year);
  }

  for (const brand_models of Object.values(models_by_brand)) {
    brand_models.sort(
      (a, b) => getModelVersionSortKey(b.value, b.label) - getModelVersionSortKey(a.value, a.label),
    );
  }
  for (const [brand, brand_lines] of Object.entries(model_lines_by_brand)) {
    brand_lines.sort((a, b) => getModelLineSortKey(a.value) - getModelLineSortKey(b.value));
    model_lines_by_brand[brand] = brand_lines;
  }

  const brand_options = Object.entries(brand_counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([brand, count]) => ({
      value: brand,
      label: brand.charAt(0).toUpperCase() + brand.slice(1),
      count,
    }));

  const region_options = Object.entries(region_counts)
    .sort((a, b) => b[1] - a[1])
    .map(([region, count]) => ({ value: region, label: region, count }));

  const brand_tree = buildBrandTree(brand_options, models_by_brand, model_line_by_model_by_brand);

  return {
    brand_options,
    brand_tree,
    models_by_brand,
    model_lines_by_brand,
    damage_type_counts,
    region_options,
    price_bounds: buildBounds(prices, [0, 5000]),
    profitability_bounds: buildBounds(profitability_values, [-100, 150]),
    year_bounds: buildBounds(release_years, DEFAULT_YEAR_BOUNDS),
  };
}
