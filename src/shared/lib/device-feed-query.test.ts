import { describe, expect, it } from "vitest";
import {
  appendDeviceFeedQuery,
  filterDeviceFeed,
  paginateDeviceFeed,
  parseDeviceFeedPageQuery,
  sortDeviceFeed,
  type DeviceFeedItem,
} from "./device-feed-query";
import { DEFAULT_DEVICE_FEED_FILTERS } from "@/shared/types/filters";

function item(overrides: Partial<DeviceFeedItem> & Pick<DeviceFeedItem, "id">): DeviceFeedItem {
  return {
    brand: "apple",
    model_key: "iphone 13",
    model_label: "iPhone 13",
    model_line: "iphone",
    damage_types: ["screen"],
    region: "Mazowieckie",
    price_buy: 800,
    created_at: "2026-08-01T00:00:00.000Z",
    release_year: 2021,
    repairability_score: 6,
    repairability_scale: 10,
    liquidity_score: 70,
    profit_estimate: 200,
    profitability_pct: 25,
    confidence_score: 80,
    risk_adjusted_profit: 150,
    risk_adjusted_profitability_pct: 18,
    parts_cost_estimate: 180,
    ...overrides,
  };
}

describe("parseDeviceFeedPageQuery", () => {
  it("читает page как offset и csv-фильтры", () => {
    const params = new URLSearchParams(
      "page=3&limit=24&sort=price_asc&brands=apple,samsung&price_min=100&price_max=900&meta=1",
    );
    const query = parseDeviceFeedPageQuery(params, { offset: 0, limit: 50 });
    expect(query.offset).toBe(48);
    expect(query.limit).toBe(24);
    expect(query.sort).toBe("price_asc");
    expect(query.include_meta).toBe(true);
    expect(query.filters.brands).toEqual(["apple", "samsung"]);
    expect(query.filters.price_range).toEqual([100, 900]);
  });

  it("неизвестный sort падает в recommended_repair", () => {
    const query = parseDeviceFeedPageQuery(new URLSearchParams("sort=nope"), { offset: 0, limit: 50 });
    expect(query.sort).toBe("recommended_repair");
  });
});

describe("filter/sort/paginate", () => {
  const devices = [
    item({ id: 1, brand: "apple", price_buy: 500, profitability_pct: 40, created_at: "2026-08-02T00:00:00.000Z" }),
    item({ id: 2, brand: "samsung", model_key: "galaxy s24", model_line: "galaxy s", price_buy: 900, profitability_pct: 10, damage_types: [], created_at: "2026-08-03T00:00:00.000Z" }),
    item({ id: 3, brand: "apple", price_buy: 1200, profitability_pct: 5, region: "Małopolskie" }),
  ];

  it("фильтрует по модели без марки и серии", () => {
    const filtered = filterDeviceFeed(devices, {
      ...DEFAULT_DEVICE_FEED_FILTERS,
      models: ["iphone 13"],
    });
    expect(filtered.map((row) => row.id)).toEqual([1, 3]);
  });

  it("не требует совпадения серии, если выбрана конкретная модель", () => {
    const filtered = filterDeviceFeed(devices, {
      ...DEFAULT_DEVICE_FEED_FILTERS,
      brands: ["apple"],
      model_lines: ["iphone pro"],
      models: ["iphone 13"],
    });
    expect(filtered.map((row) => row.id)).toEqual([1, 3]);
  });

  it("сортирует по цене и пагинирует", () => {
    const sorted = sortDeviceFeed(devices, "price_asc");
    expect(sorted.map((row) => row.id)).toEqual([1, 2, 3]);
    const page = paginateDeviceFeed(sorted, 1, 1);
    expect(page.items.map((row) => row.id)).toEqual([2]);
    expect(page.total_count).toBe(3);
    expect(page.has_more).toBe(true);
  });
});

describe("appendDeviceFeedQuery", () => {
  it("сериализует фильтры в query string", () => {
    const search = new URLSearchParams();
    appendDeviceFeedQuery(search, {
      offset: 24,
      limit: 24,
      sort: "newest",
      include_meta: true,
      filters: {
        ...DEFAULT_DEVICE_FEED_FILTERS,
        brands: ["apple"],
        price_range: [100, 500],
      },
    });
    expect(search.get("offset")).toBe("24");
    expect(search.get("sort")).toBe("newest");
    expect(search.get("brands")).toBe("apple");
    expect(search.get("price_min")).toBe("100");
    expect(search.get("meta")).toBe("1");
  });
});
