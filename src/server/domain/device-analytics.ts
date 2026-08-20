import type { AllegroPart, AnalyzedDevice, MarketSellPriceSource } from "@/shared/types/domain";
import type { DealLogistics } from "@/shared/lib/deal-economics";
import { computeDealConfidence, type ConfidenceLabel } from "@/server/domain/deal-confidence";
import { computeRiskAdjustedProfit } from "@/server/domain/risk-adjusted-profit";

export interface DeviceAnalyticsInput {
  price_buy: number | null;
  is_negotiable: boolean | null;
  parts: AllegroPart[];
  market_sell_price: number | null;
  market_sell_price_source: MarketSellPriceSource | null;
  repairability_score: number | null;
  repairability_scale: number | null;
  manual_repair_complexity_pct?: number | null;
  liquidity_score: number | null;
  median_sample_count?: number | null;
  logistics?: DealLogistics | null;
}

export type DeviceAnalytics = Pick<
  AnalyzedDevice,
  | "parts_cost_estimate"
  | "profit_estimate"
  | "profitability_pct"
  | "confidence_score"
  | "confidence_label"
  | "risk_adjusted_profit"
  | "risk_adjusted_profitability_pct"
  | "parts_real_count"
  | "parts_estimate_count"
>;

export function computeDeviceAnalytics(input: DeviceAnalyticsInput): DeviceAnalytics {
  const confidence = computeDealConfidence({
    parts: input.parts,
    market_sell_price: input.market_sell_price,
    market_sell_price_source: input.market_sell_price_source,
    median_sample_count: input.median_sample_count,
  });

  const risk = computeRiskAdjustedProfit({
    price_buy: input.price_buy,
    is_negotiable: input.is_negotiable,
    parts: input.parts,
    market_sell_price: input.market_sell_price,
    repairability_score: input.repairability_score,
    repairability_scale: input.repairability_scale,
    manual_repair_complexity_pct: input.manual_repair_complexity_pct,
    liquidity_score: input.liquidity_score,
    confidence_score: confidence.confidence_score,
    logistics: input.logistics,
  });

  return {
    parts_cost_estimate: risk.parts_cost_estimate,
    profit_estimate: risk.profit_estimate,
    profitability_pct: risk.profitability_pct,
    confidence_score: confidence.confidence_score,
    confidence_label: confidence.confidence_label as ConfidenceLabel,
    risk_adjusted_profit: risk.risk_adjusted_profit,
    risk_adjusted_profitability_pct: risk.risk_adjusted_profitability_pct,
    parts_real_count: confidence.parts_real_count,
    parts_estimate_count: confidence.parts_estimate_count,
  };
}
