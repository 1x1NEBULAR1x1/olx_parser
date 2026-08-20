import { describe, expect, it } from "vitest";
import { applyDealLogistics, calculateDealProfit } from "@/shared/lib/deal-economics";
import type { AnalyzedDevice } from "@/shared/types/domain";

function makeDevice(overrides: Partial<AnalyzedDevice> = {}): AnalyzedDevice {
  return {
    id: 1,
    title: "Test",
    olx_url: "https://olx.pl/1",
    price_buy: 1000,
    price_currency: "PLN",
    is_negotiable: false,
    brand: "apple",
    model_query: "iphone",
    model_key: "iphone 13",
    model_label: "iPhone 13",
    model_line: "iphone",
    model_line_label: "iPhone",
    photos: [],
    city: null,
    region: null,
    created_at: new Date().toISOString(),
    release_year: 2021,
    has_box: false,
    battery_health_percent: null,
    storage_gb: 128,
    seller_name: null,
    seller_ads_count: null,
    seller_member_since: null,
    damage_types: [],
    post_summary: "",
    repairability_score: 6,
    repairability_scale: 10,
    ifixit_device_name: null,
    ifixit_url: null,
    allegro_parts: [],
    allegro_search_url: null,
    parts_cost_estimate: 200,
    market_sell_price: 1800,
    market_sell_price_source: "model_hint",
    profit_estimate: 500,
    profitability_pct: 30,
    confidence_score: 80,
    confidence_label: "high",
    risk_adjusted_profit: 400,
    risk_adjusted_profitability_pct: 25,
    parts_real_count: 1,
    parts_estimate_count: 0,
    liquidity_score: 70,
    liquidity_label: "high",
    last_analyzed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("deal economics logistics overlay", () => {
  it("subtracts shipping only on the client overlay", () => {
    const without_shipping = calculateDealProfit({
      price_buy: 1000,
      parts_cost_estimate: 200,
      market_sell_price: 1800,
      repairability_score: 10,
      repairability_scale: 10,
      apply_complexity: false,
    });
    const with_shipping = applyDealLogistics(makeDevice({
      profit_estimate: without_shipping.profit_estimate,
    }), {
      shipping_parts_pln: 14,
      shipping_to_repair_pln: 18,
      shipping_to_customer_pln: 18,
      repair_labor_base_pln: 0,
    });
    expect(with_shipping.profit_estimate).toBe((without_shipping.profit_estimate ?? 0) - 50);
  });
});
