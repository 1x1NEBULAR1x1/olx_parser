import { describe, expect, it } from "vitest";
import type { BrandFilterTreeNode } from "@/shared/types/domain";
import { DEFAULT_DEVICE_FEED_FILTERS } from "@/shared/types/filters";
import {
  selectBrandTreeBrands,
  selectBrandTreeLines,
  selectBrandTreeModels,
} from "./brand-tree-selection";

const TREE: BrandFilterTreeNode[] = [
  {
    brand: "apple",
    label: "Apple",
    count: 3,
    lines: [
      {
        line_value: "iphone",
        line_label: "iPhone",
        line_count: 2,
        models: [
          { value: "iphone 13", label: "iPhone 13", count: 1 },
          { value: "iphone 14", label: "iPhone 14", count: 1 },
        ],
      },
      {
        line_value: "iphone pro",
        line_label: "iPhone Pro",
        line_count: 1,
        models: [{ value: "iphone 14 pro", label: "iPhone 14 Pro", count: 1 }],
      },
    ],
  },
];

describe("brand tree selection", () => {
  it("auto-selects brand and series when a model is checked", () => {
    const next = selectBrandTreeModels(TREE, DEFAULT_DEVICE_FEED_FILTERS, ["iphone 13"]);
    expect(next.models).toEqual(["iphone 13"]);
    expect(next.model_lines).toEqual(["iphone"]);
    expect(next.brands).toEqual(["apple"]);
  });

  it("auto-selects brand when a series is checked", () => {
    const next = selectBrandTreeLines(TREE, DEFAULT_DEVICE_FEED_FILTERS, ["iphone pro"]);
    expect(next.model_lines).toEqual(["iphone pro"]);
    expect(next.brands).toEqual(["apple"]);
    expect(next.models).toEqual([]);
  });

  it("removes models of an unchecked series", () => {
    const selected = selectBrandTreeModels(TREE, DEFAULT_DEVICE_FEED_FILTERS, ["iphone 13"]);
    const next = selectBrandTreeLines(TREE, selected, []);
    expect(next.models).toEqual([]);
    expect(next.model_lines).toEqual([]);
  });

  it("removes series and models of an unchecked brand", () => {
    const selected = selectBrandTreeModels(TREE, DEFAULT_DEVICE_FEED_FILTERS, ["iphone 13"]);
    const next = selectBrandTreeBrands(TREE, selected, []);
    expect(next.brands).toEqual([]);
    expect(next.model_lines).toEqual([]);
    expect(next.models).toEqual([]);
  });
});
