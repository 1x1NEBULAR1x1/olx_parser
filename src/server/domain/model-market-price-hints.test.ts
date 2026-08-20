import { describe, expect, it } from "vitest";
import { extractModelKey } from "@/server/domain/model-normalizer";
import { extractBrand } from "@/server/domain/brand-extractor";
import { getModelMarketPrice, resolveStartingMarketPrice } from "@/server/domain/model-market-price-hints";

describe("used market prices 2026", () => {
  it("does not treat Redmi 13 as Xiaomi Mi 13", () => {
    const title = "Xiaomi Redmi 13 8/256";
    const brand = extractBrand(title);
    expect(brand).toBe("redmi");
    const { model_key } = extractModelKey(brand, title);
    expect(model_key).toBe("redmi 13");
    const price = getModelMarketPrice(model_key, 256);
    expect(price).toBeGreaterThan(500);
    expect(price).toBeLessThan(750);
  });

  it("prices Redmi Note 13 Pro 5G near real OLX used, not 465", () => {
    const price = getModelMarketPrice("redmi note 13 pro 5g", 256);
    expect(price).toBeGreaterThan(850);
    expect(price).toBeLessThan(1200);
  });

  it("gives every known brand a starting price even without a model hint", () => {
    expect(resolveStartingMarketPrice("honor", "honor 60", 128)).toBeGreaterThan(200);
    expect(resolveStartingMarketPrice("samsung", "samsung galaxy s10", 128)).toBe(480);
  });

  it("does not price Galaxy S25 FE as flagship S25", () => {
    const fe = getModelMarketPrice("samsung galaxy s25 fe", 128);
    const s25 = getModelMarketPrice("samsung galaxy s25", 128);
    expect(fe).not.toBeNull();
    expect(s25).not.toBeNull();
    expect(fe!).toBeLessThan(s25!);
    expect(fe!).toBeGreaterThan(1600);
    expect(fe!).toBeLessThan(2200);
  });

  it("prices iPhone 17 Pro by variant, not as base 17", () => {
    const price_256 = getModelMarketPrice("apple iphone 17 pro", 256);
    const price_512 = getModelMarketPrice("apple iphone 17 pro", 512);
    const base_256 = getModelMarketPrice("apple iphone 17", 256);
    expect(price_256).not.toBeNull();
    expect(price_512).not.toBeNull();
    expect(base_256).not.toBeNull();
    expect(price_256!).toBeGreaterThan(4800);
    expect(price_256!).toBeLessThan(5800);
    expect(price_512!).toBeGreaterThan(price_256!);
    expect(price_512! - price_256!).toBeLessThan(900);
    expect(base_256!).toBeLessThan(price_256!);
  });
});
