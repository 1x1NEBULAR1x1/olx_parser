import styles from "./FilterBar.module.scss";
import { useTranslations } from "next-intl";
import { CheckboxGroup, type CheckboxOption } from "@/components/CheckboxGroup/CheckboxGroup";
import { RangeSlider } from "@/components/RangeSlider/RangeSlider";
import { BrandTreeFilter } from "@/components/FilterBar/BrandTreeFilter";
import type { BrandFilterTreeNode } from "@/lib/api";

// null у диапазонов означает "фильтр не применён" (весь доступный диапазон),
// а не конкретное числовое значение — так слайдер всегда показывает актуальные
// границы текущей выдачи (bounds из page.tsx), даже если они изменились между
// обновлениями данных, а не "замороженное" значение с прошлого рендера.
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
  brand_tree, models_by_brand, model_lines_by_brand, damage_type_counts, region_options,
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
    const removed_brands = filters.brands.filter((b) => !next_brands.includes(b));
    const next_models = removed_brands.length > 0
      ? filters.models.filter((model_key) => {
          const owning_brand = Object.entries(models_by_brand)
            .find(([, options]) => options.some((o) => o.value === model_key))?.[0];
          return !owning_brand || !removed_brands.includes(owning_brand);
        })
      : filters.models;
    const next_model_lines = removed_brands.length > 0
      ? filters.model_lines.filter((model_line) => {
          const owning_brand = Object.entries(model_lines_by_brand)
            .find(([, options]) => options.some((o) => o.value === model_line))?.[0];
          return !owning_brand || !removed_brands.includes(owning_brand);
        })
      : filters.model_lines;

    onChange({ ...filters, brands: next_brands, models: next_models, model_lines: next_model_lines });
  }

  const damage_type_options: CheckboxOption[] = DAMAGE_TYPES.map((dt) => ({
    value: dt,
    label: td(dt),
    count: damage_type_counts[dt] ?? 0,
  })).filter((option) => option.count > 0);

  const has_active = !isFilterBarEmpty(filters);

  return (
    <aside className={styles.filter_bar}>
      <div className={styles.filter_bar_title}>{t("title")}</div>

      <div className={styles.filter_bar_group}>
        <label className={styles.filter_bar_label}>{t("brand")}</label>
        <BrandTreeFilter
          brand_tree={brand_tree}
          selected_brands={filters.brands}
          selected_models={filters.models}
          selected_model_lines={filters.model_lines}
          onBrandsChange={handleBrandsChange}
          onModelsChange={(next_models) => update("models", next_models)}
          onModelLinesChange={(next_model_lines) => update("model_lines", next_model_lines)}
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
        <label className={styles.filter_bar_label}>{t("min_repairability")}</label>
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
        <label className={styles.filter_bar_label}>{t("profitability_range")}</label>
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
        <label className={styles.filter_bar_label}>{t("liquidity_range")}</label>
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
