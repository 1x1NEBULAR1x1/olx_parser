import { describe, expect, it } from "vitest";
import type { AnalyzedDevice } from "@/shared/types/domain";
import { detectDeviceWarnings } from "./scan-issue-detector";

function makeDevice(overrides: Partial<AnalyzedDevice> = {}): AnalyzedDevice {
  return {
    id: 1091298468,
    title: "Poco f8 ultra 12/256 idealny",
    olx_url: "https://www.olx.pl/d/oferta/x.html",
    price_buy: 2000,
    price_currency: "PLN",
    is_negotiable: false,
    brand: "poco",
    model_query: "poco f8 ultra",
    model_key: "poco f8 ultra",
    model_label: "POCO F8 Ultra",
    model_line: "poco f",
    model_line_label: "POCO F",
    photos: ["https://example.com/1.jpg"],
    city: null,
    region: null,
    created_at: new Date().toISOString(),
    release_year: 2026,
    has_box: true,
    battery_health_percent: null,
    storage_gb: 256,
    seller_name: "Paweł",
    seller_ads_count: null,
    seller_member_since: "2022-08-09",
    damage_types: [],
    post_summary: "Posiadam na zamianę poco f8 ultra wersja 12/256",
    repairability_score: 6,
    repairability_scale: 10,
    ifixit_device_name: null,
    ifixit_url: null,
    allegro_parts: [{
      title: "★ Ekran",
      price: 400,
      currency: "PLN",
      url: "",
      image: null,
      is_estimate: true,
    }],
    allegro_search_url: null,
    parts_cost_estimate: 400,
    market_sell_price: 2800,
    market_sell_price_source: "model_hint",
    profit_estimate: 300,
    profitability_pct: 15,
    confidence_score: 70,
    confidence_label: "medium",
    risk_adjusted_profit: 200,
    risk_adjusted_profitability_pct: 10,
    parts_real_count: 0,
    parts_estimate_count: 1,
    liquidity_score: 60,
    liquidity_label: "medium",
    last_analyzed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("detectDeviceWarnings", () => {
  it("does not warn about description, iFixit stub or estimate parts", () => {
    const warnings = detectDeviceWarnings(makeDevice());
    expect(warnings.map((item) => item.kind)).toEqual([]);
  });

  it("still warns when repairability is completely missing", () => {
    const warnings = detectDeviceWarnings(makeDevice({
      repairability_score: null,
      repairability_scale: null,
    }));
    expect(warnings.map((item) => item.kind)).toEqual(["missing_repairability"]);
  });
});
