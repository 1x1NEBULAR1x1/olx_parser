import { describe, expect, it } from "vitest";
import { computeDealConfidence } from "./deal-confidence";

describe("computeDealConfidence", () => {
  it("высокая уверенность при медиане рынка и реальных запчастях", () => {
    const result = computeDealConfidence({
      parts: [
        { title: "ekran", price: 200, currency: "PLN", url: "https://x", image: null, damage_type: "screen", is_estimate: false, source: "olx" },
      ],
      market_sell_price: 1500,
      market_sell_price_source: "model_median",
      median_sample_count: 8,
    });
    expect(result.confidence_label).toBe("high");
    expect(result.parts_real_count).toBe(1);
    expect(result.parts_estimate_count).toBe(0);
  });

  it("низкая уверенность без рынка и со стабом запчастей", () => {
    const result = computeDealConfidence({
      parts: [
        { title: "ekran ★", price: 200, currency: "PLN", url: "https://x", image: null, damage_type: "screen", is_estimate: true, source: "estimate" },
      ],
      market_sell_price: null,
      market_sell_price_source: "brand_estimate",
    });
    expect(result.confidence_label).toBe("low");
    expect(result.parts_estimate_count).toBe(1);
  });
});
