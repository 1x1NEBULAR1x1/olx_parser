import { describe, expect, it } from "vitest";
import {
  refreshEstimatePartPrices,
  resolveStubPartPrice,
} from "@/server/domain/repair-parts-stubs";

describe("resolveStubPartPrice", () => {
  it("keeps Galaxy S25 FE screen in a realistic aftermarket range", () => {
    const price = resolveStubPartPrice("samsung", "samsung galaxy s25 fe", "screen", 128);
    expect(price).toBeGreaterThan(300);
    expect(price).toBeLessThan(700);
  });

  it("rewrites a stale S25 FE screen estimate without touching real parts", () => {
    const [estimate, real] = refreshEstimatePartPrices(
      [
        {
          title: "Samsung Galaxy S25 Fe · Wyświetlacz LCD/AMOLED ★",
          price: 1134,
          currency: "PLN",
          url: "https://example.com",
          image: null,
          damage_type: "screen",
          is_estimate: true,
          source: "estimate",
        },
        {
          title: "Oryginalny wyświetlacz",
          price: 520,
          currency: "PLN",
          url: "https://example.com/real",
          image: null,
          damage_type: "screen",
          is_estimate: false,
          source: "olx",
        },
      ],
      "samsung",
      "samsung galaxy s25 fe",
      "Galaxy S25 FE",
      128,
    );

    expect(estimate.price).toBeLessThan(700);
    expect(estimate.price).not.toBe(1134);
    expect(real.price).toBe(520);
  });
});
