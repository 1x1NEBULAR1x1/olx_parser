import type { BrandFilterTreeNode } from "@/shared/types/domain";
import type { DeviceFeedFilters } from "@/shared/types/filters";

export interface BrandTreeLocation {
  brand: string;
  line_value: string;
}

export function findModelLocation(
  brand_tree: BrandFilterTreeNode[],
  model_key: string,
): BrandTreeLocation | null {
  for (const brand_node of brand_tree) {
    for (const line_group of brand_node.lines) {
      if (line_group.models.some((model) => model.value === model_key)) {
        return { brand: brand_node.brand, line_value: line_group.line_value };
      }
    }
  }
  return null;
}

export function findLineBrand(
  brand_tree: BrandFilterTreeNode[],
  line_value: string,
): string | null {
  if (!line_value) return null;
  for (const brand_node of brand_tree) {
    if (brand_node.lines.some((line_group) => line_group.line_value === line_value)) {
      return brand_node.brand;
    }
  }
  return null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function modelsInLine(
  brand_tree: BrandFilterTreeNode[],
  brand: string,
  line_value: string,
): string[] {
  const brand_node = brand_tree.find((node) => node.brand === brand);
  const line_group = brand_node?.lines.find((group) => group.line_value === line_value);
  return line_group?.models.map((model) => model.value) ?? [];
}

function modelsInBrand(brand_tree: BrandFilterTreeNode[], brand: string): string[] {
  const brand_node = brand_tree.find((node) => node.brand === brand);
  if (!brand_node) return [];
  return brand_node.lines.flatMap((line_group) => line_group.models.map((model) => model.value));
}

function linesInBrand(brand_tree: BrandFilterTreeNode[], brand: string): string[] {
  const brand_node = brand_tree.find((node) => node.brand === brand);
  if (!brand_node) return [];
  return brand_node.lines.map((line_group) => line_group.line_value).filter(Boolean);
}

/** Родители выбранных моделей/серий всегда включены — иначе AND по дереву даёт пустую выдачу. */
export function withBrandTreeParents(
  brand_tree: BrandFilterTreeNode[],
  selection: Pick<DeviceFeedFilters, "brands" | "model_lines" | "models">,
): Pick<DeviceFeedFilters, "brands" | "model_lines" | "models"> {
  const brands = [...selection.brands];
  const model_lines = [...selection.model_lines];

  for (const model_key of selection.models) {
    const location = findModelLocation(brand_tree, model_key);
    if (!location) continue;
    if (!brands.includes(location.brand)) brands.push(location.brand);
    if (location.line_value && !model_lines.includes(location.line_value)) {
      model_lines.push(location.line_value);
    }
  }

  for (const line_value of model_lines) {
    const brand = findLineBrand(brand_tree, line_value);
    if (brand && !brands.includes(brand)) brands.push(brand);
  }

  return {
    brands: unique(brands),
    model_lines: unique(model_lines),
    models: selection.models,
  };
}

export function selectBrandTreeModels(
  brand_tree: BrandFilterTreeNode[],
  current: DeviceFeedFilters,
  next_models: string[],
): DeviceFeedFilters {
  return {
    ...current,
    ...withBrandTreeParents(brand_tree, {
      brands: current.brands,
      model_lines: current.model_lines,
      models: next_models,
    }),
  };
}

export function selectBrandTreeLines(
  brand_tree: BrandFilterTreeNode[],
  current: DeviceFeedFilters,
  next_model_lines: string[],
): DeviceFeedFilters {
  const removed_lines = current.model_lines.filter((line) => !next_model_lines.includes(line));
  let next_models = current.models;
  if (removed_lines.length > 0) {
    const removed_model_keys = new Set<string>();
    for (const line_value of removed_lines) {
      const brand = findLineBrand(brand_tree, line_value);
      if (!brand) continue;
      for (const model_key of modelsInLine(brand_tree, brand, line_value)) {
        removed_model_keys.add(model_key);
      }
    }
    next_models = current.models.filter((model_key) => !removed_model_keys.has(model_key));
  }

  return {
    ...current,
    ...withBrandTreeParents(brand_tree, {
      brands: current.brands,
      model_lines: next_model_lines,
      models: next_models,
    }),
  };
}

export function selectBrandTreeBrands(
  brand_tree: BrandFilterTreeNode[],
  current: DeviceFeedFilters,
  next_brands: string[],
): DeviceFeedFilters {
  const removed_brands = current.brands.filter((brand) => !next_brands.includes(brand));
  let next_models = current.models;
  let next_model_lines = current.model_lines;

  if (removed_brands.length > 0) {
    const removed_model_keys = new Set(removed_brands.flatMap((brand) => modelsInBrand(brand_tree, brand)));
    const removed_line_values = new Set(removed_brands.flatMap((brand) => linesInBrand(brand_tree, brand)));
    next_models = current.models.filter((model_key) => !removed_model_keys.has(model_key));
    next_model_lines = current.model_lines.filter((line_value) => !removed_line_values.has(line_value));
  }

  return {
    ...current,
    ...withBrandTreeParents(brand_tree, {
      brands: next_brands,
      model_lines: next_model_lines,
      models: next_models,
    }),
  };
}
