import { describe, expect, it } from "vitest";
import { passesProfitFloor } from "@/server/domain/profit-floor";

const off = {
  exclude_unprofitable: false,
  min_profit_pln: 0,
  min_profit_pct_of_price: 0,
};

const on_zero = {
  exclude_unprofitable: true,
  min_profit_pln: 0,
  min_profit_pct_of_price: 0,
};

describe("passesProfitFloor", () => {
  it("keeps every listing when the filter is off", () => {
    expect(passesProfitFloor({
      price_buy: 1000,
      risk_adjusted_profit: -40,
      profit_estimate: -10,
    }, off)).toBe(true);
  });

  it("hides negative profit when only the toggle is on", () => {
    expect(passesProfitFloor({
      price_buy: 800,
      risk_adjusted_profit: -20,
      profit_estimate: 50,
    }, on_zero)).toBe(false);
    expect(passesProfitFloor({
      price_buy: 800,
      risk_adjusted_profit: 0,
      profit_estimate: 50,
    }, on_zero)).toBe(true);
  });

  it("applies both a zł floor and a percent-of-price floor", () => {
    const settings = {
      exclude_unprofitable: true,
      min_profit_pln: 100,
      min_profit_pct_of_price: 15,
    };

    expect(passesProfitFloor({
      price_buy: 1000,
      risk_adjusted_profit: 180,
      profit_estimate: 180,
    }, settings)).toBe(true);

    expect(passesProfitFloor({
      price_buy: 1000,
      risk_adjusted_profit: 80,
      profit_estimate: 80,
    }, settings)).toBe(false);

    expect(passesProfitFloor({
      price_buy: 2000,
      risk_adjusted_profit: 200,
      profit_estimate: 200,
    }, settings)).toBe(false);
  });

  it("keeps listings without a computed profit", () => {
    expect(passesProfitFloor({
      price_buy: 900,
      risk_adjusted_profit: null,
      profit_estimate: null,
    }, on_zero)).toBe(true);
  });
});
