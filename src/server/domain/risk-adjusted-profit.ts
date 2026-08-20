import { calculateRiskAdjustedDeal, type DealLogistics } from "@/shared/lib/deal-economics";
import { estimatePartsCost, type ProfitabilityResult } from "@/server/domain/profitability";
import type { AllegroPart } from "@/shared/types/domain";

export interface RiskAdjustedProfitInput {
  price_buy: number | null;
  is_negotiable: boolean | null;
  parts: AllegroPart[];
  market_sell_price: number | null;
  repairability_score: number | null;
  repairability_scale: number | null;
  manual_repair_complexity_pct?: number | null;
  liquidity_score: number | null;
  confidence_score: number;
  logistics?: DealLogistics | null;
}

export interface RiskAdjustedProfitResult extends ProfitabilityResult {
  risk_adjusted_profit: number | null;
  risk_adjusted_profitability_pct: number | null;
  effective_price_buy: number | null;
}

export function computeRiskAdjustedProfit(input: RiskAdjustedProfitInput): RiskAdjustedProfitResult {
  const effective_price_buy = input.price_buy !== null && input.is_negotiable
    ? Math.round(input.price_buy * 0.95)
    : input.price_buy;

  const result = calculateRiskAdjustedDeal({
    price_buy: input.price_buy,
    is_negotiable: input.is_negotiable,
    parts_cost_estimate: estimatePartsCost(input.parts),
    market_sell_price: input.market_sell_price,
    repairability_score: input.repairability_score,
    repairability_scale: input.repairability_scale,
    manual_repair_complexity_pct: input.manual_repair_complexity_pct,
    liquidity_score: input.liquidity_score,
    confidence_score: input.confidence_score,
    logistics: input.logistics,
  });

  return {
    ...result,
    effective_price_buy,
  };
}
