import { describe, expect, it } from "vitest";
import { compareRecommendedRepair, computeRecommendedRepairScore } from "./recommended-repair-score";
import type { DeviceScoreInput } from "./recommended-repair-score";

function device(overrides: Partial<DeviceScoreInput> = {}): DeviceScoreInput {
  return {
    price_buy: 800,
    damage_types: ["screen"],
    repairability_score: 6,
    repairability_scale: 10,
    liquidity_score: 70,
    profit_estimate: 250,
    profitability_pct: 30,
    confidence_score: 80,
    risk_adjusted_profit: 180,
    risk_adjusted_profitability_pct: 22,
    parts_cost_estimate: 180,
    ...overrides,
  };
}

describe("computeRecommendedRepairScore", () => {
  it("штрафует locked/water сильнее обычного экрана", () => {
    const screen = computeRecommendedRepairScore(device());
    const locked = computeRecommendedRepairScore(device({ damage_types: ["locked"] }));
    expect(screen).toBeGreaterThan(locked);
  });

  it("compare ставит более прибыльный лот выше", () => {
    const better = device({ risk_adjusted_profit: 400, risk_adjusted_profitability_pct: 35 });
    const worse = device({ risk_adjusted_profit: 40, risk_adjusted_profitability_pct: 5 });
    expect(compareRecommendedRepair(better, worse)).toBeLessThan(0);
  });
});
