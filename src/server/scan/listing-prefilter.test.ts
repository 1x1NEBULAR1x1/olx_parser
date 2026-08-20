import { describe, expect, it } from "vitest";
import {
  guessDamageTypesFromTitle,
  scoreListingCandidate,
  selectListingsForFullAnalysis,
  type ListingCandidate,
} from "./listing-prefilter";

function candidate(overrides: Partial<ListingCandidate> & Pick<ListingCandidate, "id">): ListingCandidate {
  return {
    title: "phone",
    price_buy: 500,
    brand: "apple",
    model_key: "iphone 13",
    storage_gb: 128,
    guessed_damage_types: ["screen"],
    estimated_sell_price: 1200,
    estimated_parts_cost: 200,
    estimated_profit: 500,
    priority_score: 500,
    ...overrides,
  };
}

describe("guessDamageTypesFromTitle", () => {
  it("находит экран и игнорит «nowa bateria» без маркера поломки", () => {
    expect(guessDamageTypesFromTitle("iPhone 13 ekran pęknięty")).toContain("screen");
    expect(guessDamageTypesFromTitle("Samsung A54 nowa bateria 100%")).not.toContain("battery");
  });
});

describe("scoreListingCandidate", () => {
  it("ставит выше приоритет битому iPhone с низкой ценой", () => {
    const cheap_damaged = scoreListingCandidate({
      id: 1,
      title: "iPhone 13 Pro ekran pęknięty 128GB",
      price_buy: 400,
    });
    const expensive_ok = scoreListingCandidate({
      id: 2,
      title: "iPhone 13 Pro 128GB",
      price_buy: 2800,
    });

    expect(cheap_damaged.brand).toBe("apple");
    expect(cheap_damaged.guessed_damage_types).toContain("screen");
    expect(cheap_damaged.priority_score).toBeGreaterThan(expensive_ok.priority_score);
  });
});

describe("selectListingsForFullAnalysis", () => {
  it("если two-phase выключен — анализирует все", () => {
    const result = selectListingsForFullAnalysis(
      [candidate({ id: 1 }), candidate({ id: 2 })],
      { enabled: false, full_analyze_limit: 1, min_profit_pln: 80 },
    );
    expect(result.full_ids).toEqual([1, 2]);
    expect(result.lightweight_ids).toEqual([]);
  });

  it("берёт прибыльные и добивает лимит топом по score", () => {
    const result = selectListingsForFullAnalysis(
      [
        candidate({ id: 1, estimated_profit: 300, priority_score: 300 }),
        candidate({ id: 2, estimated_profit: 10, priority_score: 10 }),
        candidate({ id: 3, estimated_profit: 5, priority_score: 90 }),
        candidate({ id: 4, estimated_profit: 200, priority_score: 200 }),
      ],
      { enabled: true, full_analyze_limit: 3, min_profit_pln: 80 },
    );

    expect(result.full_ids).toEqual([1, 4, 3]);
    expect(result.lightweight_ids).toEqual([2]);
  });
});
