import { describe, expect, it } from "vitest";
import {
  idsNeedingAnalysis,
  listingsMatch,
  partitionDeltaScan,
  pricesMatch,
} from "./delta-scan";

describe("pricesMatch", () => {
  it("считает близкие цены одинаковыми", () => {
    expect(pricesMatch(100, 100.2)).toBe(true);
    expect(pricesMatch(100, 101)).toBe(false);
    expect(pricesMatch(null, null)).toBe(true);
    expect(pricesMatch(10, null)).toBe(false);
  });
});

describe("listingsMatch", () => {
  it("требует тот же id, title и цену", () => {
    const base = { id: 1, title: "iPhone 13", price_buy: 900 };
    expect(listingsMatch(base, { ...base, title: " iPhone 13 " })).toBe(true);
    expect(listingsMatch(base, { ...base, title: "iPhone 13 Pro" })).toBe(false);
    expect(listingsMatch(base, { ...base, price_buy: 1200 })).toBe(false);
  });
});

describe("partitionDeltaScan", () => {
  it("делит объявления на new/changed/unchanged/dropped", () => {
    const previous = new Map([
      [1, { id: 1, title: "A", price_buy: 100 }],
      [2, { id: 2, title: "B", price_buy: 200 }],
      [3, { id: 3, title: "C", price_buy: 300 }],
    ]);

    const partition = partitionDeltaScan(
      [
        { id: 1, title: "A", price_buy: 100 },
        { id: 2, title: "B", price_buy: 250 },
        { id: 4, title: "D", price_buy: 400 },
      ],
      previous,
    );

    expect(partition.unchanged_ids).toEqual([1]);
    expect(partition.changed_ids).toEqual([2]);
    expect(partition.new_ids).toEqual([4]);
    expect(partition.dropped_ids).toEqual([3]);
    expect(idsNeedingAnalysis(partition).sort()).toEqual([2, 4]);
  });

  it("если предыдущего скана нет — все incoming новые", () => {
    const partition = partitionDeltaScan(
      [{ id: 10, title: "X", price_buy: 1 }],
      new Map(),
    );
    expect(partition.new_ids).toEqual([10]);
    expect(partition.unchanged_ids).toEqual([]);
  });
});
