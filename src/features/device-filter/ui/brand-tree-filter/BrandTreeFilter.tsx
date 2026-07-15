"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import styles from "../filter-bar/FilterBar.module.scss";
import { useTranslations } from "next-intl";
import type { BrandFilterTreeNode } from "@/shared/api/client";

interface BrandTreeFilterProps {
  brand_tree: BrandFilterTreeNode[];
  selected_brands: string[];
  selected_models: string[];
  selected_model_lines: string[];
  onBrandsChange: (brands: string[]) => void;
  onModelsChange: (models: string[]) => void;
  onModelLinesChange: (model_lines: string[]) => void;
  empty_label: string;
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function BrandTreeFilter({
  brand_tree,
  selected_brands,
  selected_models,
  selected_model_lines,
  onBrandsChange,
  onModelsChange,
  onModelLinesChange,
  empty_label,
}: BrandTreeFilterProps) {
  const t = useTranslations("filters");
  const [expanded_brands, set_expanded_brands] = useState<Set<string>>(new Set());
  const [expanded_lines, set_expanded_lines] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selected_brands.length === 0) return;
    set_expanded_brands((prev) => {
      const next = new Set(prev);
      for (const brand of selected_brands) next.add(brand);
      return next;
    });
  }, [selected_brands]);

  function toggleBrandExpand(brand: string) {
    set_expanded_brands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  }

  function toggleLineExpand(brand: string, line_value: string) {
    const line_key = `${brand}:${line_value}`;
    set_expanded_lines((prev) => {
      const next = new Set(prev);
      if (next.has(line_key)) next.delete(line_key);
      else next.add(line_key);
      return next;
    });
  }

  function handleBrandToggle(brand: string) {
    const next_brands = toggleValue(selected_brands, brand);
    onBrandsChange(next_brands);
    if (!selected_brands.includes(brand)) {
      set_expanded_brands((prev) => new Set(prev).add(brand));
    }
  }

  if (brand_tree.length === 0) {
    return <p className={styles.brand_tree_empty}>{empty_label}</p>;
  }

  return (
    <div className={styles.brand_tree}>
      {brand_tree.map((brand_node) => {
        const is_brand_expanded = expanded_brands.has(brand_node.brand);

        return (
          <div key={brand_node.brand} className={styles.brand_tree_brand}>
            <div className={styles.brand_tree_row}>
              <button
                type="button"
                className={styles.brand_tree_toggle}
                onClick={() => toggleBrandExpand(brand_node.brand)}
                aria-expanded={is_brand_expanded}
                aria-label={brand_node.label}
              >
                <ChevronRight
                  size={14}
                  aria-hidden
                  className={is_brand_expanded ? styles.brand_tree_toggle_open : undefined}
                />
              </button>
              <label className={styles.brand_tree_item}>
                <input
                  type="checkbox"
                  className={styles.brand_tree_input}
                  checked={selected_brands.includes(brand_node.brand)}
                  onChange={() => handleBrandToggle(brand_node.brand)}
                />
                <span className={styles.brand_tree_box} aria-hidden />
                <span className={styles.brand_tree_label}>{brand_node.label}</span>
                <span className={styles.brand_tree_count}>{brand_node.count}</span>
              </label>
            </div>

            {is_brand_expanded && brand_node.lines.map((line_group) => {
              const line_key = `${brand_node.brand}:${line_group.line_value}`;
              const is_line_expanded = expanded_lines.has(line_key);
              const has_line = Boolean(line_group.line_value);
              const line_label = has_line
                ? line_group.line_label
                : t("other_models");

              return (
                <div key={line_key} className={styles.brand_tree_line_block}>
                  <div className={`${styles.brand_tree_row} ${styles.brand_tree_row_nested}`}>
                    {has_line ? (
                      <button
                        type="button"
                        className={styles.brand_tree_toggle}
                        onClick={() => toggleLineExpand(brand_node.brand, line_group.line_value)}
                        aria-expanded={is_line_expanded}
                        aria-label={line_label}
                      >
                        <ChevronRight
                          size={14}
                          aria-hidden
                          className={is_line_expanded ? styles.brand_tree_toggle_open : undefined}
                        />
                      </button>
                    ) : (
                      <span className={styles.brand_tree_toggle_spacer} aria-hidden />
                    )}
                    {has_line ? (
                      <label className={styles.brand_tree_item}>
                        <input
                          type="checkbox"
                          className={styles.brand_tree_input}
                          checked={selected_model_lines.includes(line_group.line_value)}
                          onChange={() => onModelLinesChange(
                            toggleValue(selected_model_lines, line_group.line_value),
                          )}
                        />
                        <span className={styles.brand_tree_box} aria-hidden />
                        <span className={styles.brand_tree_label}>{line_label}</span>
                        <span className={styles.brand_tree_count}>{line_group.line_count}</span>
                      </label>
                    ) : (
                      <span className={styles.brand_tree_group_label}>{line_label}</span>
                    )}
                  </div>

                  {(has_line ? is_line_expanded : true) && (
                    <div className={styles.brand_tree_models}>
                      {line_group.models.map((model) => (
                        <label
                          key={model.value}
                          className={`${styles.brand_tree_item} ${styles.brand_tree_item_model}`}
                        >
                          <input
                            type="checkbox"
                            className={styles.brand_tree_input}
                            checked={selected_models.includes(model.value)}
                            onChange={() => onModelsChange(
                              toggleValue(selected_models, model.value),
                            )}
                          />
                          <span className={styles.brand_tree_box} aria-hidden />
                          <span className={styles.brand_tree_label}>{model.label}</span>
                          <span className={styles.brand_tree_count}>{model.count}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
