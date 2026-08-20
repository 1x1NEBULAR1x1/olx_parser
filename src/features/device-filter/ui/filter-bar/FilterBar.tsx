"use client";

import styles from "./FilterBar.module.scss";
import { useTranslations } from "next-intl";
import { TermHint } from "@/shared/ui/term-hint/TermHint";
import { CheckboxGroup, type CheckboxOption } from "@/shared/ui/checkbox-group/CheckboxGroup";
import { RangeSlider } from "@/shared/ui/range-slider/RangeSlider";
import { BrandTreeFilter } from "@/features/device-filter/ui/brand-tree-filter/BrandTreeFilter";
import {
  selectBrandTreeBrands,
  selectBrandTreeLines,
  selectBrandTreeModels,
} from "@/features/device-filter/lib/brand-tree-selection";
import type { BrandFilterTreeNode } from "@/shared/api/client";
import { DEFAULT_FILTERS, isFilterBarEmpty, type FilterValues } from "@/features/device-filter/model/filter-values";

export type { FilterValues };
export { DEFAULT_FILTERS, isFilterBarEmpty };

const DAMAGE_TYPES = [
  "screen", "battery", "back_cover", "buttons",
  "charging_port", "camera", "speaker", "microphone", "body",
  "frame", "locked", "water_damage", "software", "sim_slot",
];

interface FilterBarProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  brand_tree: BrandFilterTreeNode[];
  models_by_brand: Record<string, CheckboxOption[]>;
  model_lines_by_brand: Record<string, CheckboxOption[]>;
  damage_type_counts: Record<string, number>;
  region_options: CheckboxOption[];
  price_bounds: [number, number];
  profitability_bounds: [number, number];
  liquidity_bounds: [number, number];
  year_bounds: [number, number];
}

export function FilterBar({
  filters, onChange,
  brand_tree, damage_type_counts, region_options,
  price_bounds, profitability_bounds, liquidity_bounds, year_bounds,
}: FilterBarProps) {
  const t = useTranslations("filters");
  const td = useTranslations("damage_types");

  function update<K extends keyof FilterValues>(key: K, value: FilterValues[K]) {
    onChange({ ...filters, [key]: value });
  }

  function reset() {
    onChange({ ...DEFAULT_FILTERS });
  }

  function handleBrandsChange(next_brands: string[]) {
    onChange(selectBrandTreeBrands(brand_tree, filters, next_brands));
  }

  function handleModelLinesChange(next_model_lines: string[]) {
    onChange(selectBrandTreeLines(brand_tree, filters, next_model_lines));
  }

  function handleModelsChange(next_models: string[]) {
    onChange(selectBrandTreeModels(brand_tree, filters, next_models));
  }

  const damage_type_options: CheckboxOption[] = DAMAGE_TYPES.map((dt) => ({
    value: dt,
    label: td(dt),
    count: damage_type_counts[dt] ?? 0,
  })).filter((option) => option.count > 0);

  const has_active = !isFilterBarEmpty(filters);

  return (
    <aside className={styles.filter_bar} data-testid="filter-bar">
      <div className={styles.filter_bar_title}>{t("title")}</div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>{t("brand")}</label>
        <BrandTreeFilter
          brand_tree={brand_tree}
          selected_brands={filters.brands}
          selected_models={filters.models}
          selected_model_lines={filters.model_lines}
          onBrandsChange={handleBrandsChange}
          onModelsChange={handleModelsChange}
          onModelLinesChange={handleModelLinesChange}
          empty_label={t("no_options")}
        />
      </div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>{t("price_range")}</label>
        <RangeSlider
          min={price_bounds[0]}
          max={price_bounds[1]}
          step={10}
          value={filters.price_range ?? price_bounds}
          onChange={(range) => update("price_range", range)}
          formatValue={(v) => `${Math.round(v)} zł`}
        />
      </div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>{t("damage_type")}</label>
        <CheckboxGroup
          options={damage_type_options}
          selected={filters.damage_types}
          onChange={(next) => update("damage_types", next)}
          empty_label={t("no_options")}
        />
      </div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>{t("region")}</label>
        <CheckboxGroup
          options={region_options}
          selected={filters.regions}
          onChange={(next) => update("regions", next)}
          empty_label={t("no_options")}
        />
      </div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>
          <TermHint label={t("min_repairability")} hint={t("min_repairability_hint")} />
        </label>
        <input
          type="number"
          className={styles.filter_bar_input}
          placeholder="1 — 10"
          value={filters.min_repairability}
          onChange={(e) => update("min_repairability", e.target.value)}
          min={0}
          max={10}
          step={0.5}
        />
      </div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>
          <TermHint label={t("profitability_range")} hint={t("profitability_hint")} />
        </label>
        <RangeSlider
          min={profitability_bounds[0]}
          max={profitability_bounds[1]}
          step={5}
          value={filters.profitability_range ?? profitability_bounds}
          onChange={(range) => update("profitability_range", range)}
          formatValue={(v) => `${Math.round(v)}%`}
        />
      </div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>
          <TermHint label={t("liquidity_range")} hint={t("liquidity_hint")} />
        </label>
        <RangeSlider
          min={liquidity_bounds[0]}
          max={liquidity_bounds[1]}
          step={1}
          value={filters.liquidity_range ?? liquidity_bounds}
          onChange={(range) => update("liquidity_range", range)}
          formatValue={(v) => `${Math.round(v)}`}
        />
      </div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>{t("min_release_year")}</label>
        <RangeSlider
          single
          min={year_bounds[0]}
          max={year_bounds[1]}
          step={1}
          value={[year_bounds[0], filters.min_release_year ?? year_bounds[0]]}
          onChange={([, year]) => {
            const is_off = year <= year_bounds[0];
            update("min_release_year", is_off ? null : year);
          }}
          formatValue={(v) => String(Math.round(v))}
        />
      </div>

      {has_active && (
        <button className={styles.filter_bar_reset} onClick={reset}>
          {t("reset")}
        </button>
      )}
    </aside>
  );
}
