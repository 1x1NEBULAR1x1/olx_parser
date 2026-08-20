import type { AllegroPart } from "@/shared/types/domain";
import type { MarketSellPriceSource } from "@/shared/types/domain";
import { isPartEstimate } from "@/server/domain/repair-parts-stubs";

export type ConfidenceLabel = "high" | "medium" | "low";

export interface DealConfidenceInput {
  parts: AllegroPart[];
  market_sell_price_source: MarketSellPriceSource | null;
  market_sell_price: number | null;
  median_sample_count?: number | null;
}

export interface DealConfidenceResult {
  confidence_score: number;
  confidence_label: ConfidenceLabel;
  parts_real_count: number;
  parts_estimate_count: number;
}

const MARKET_SOURCE_SCORE: Record<string, number> = {
  model_median: 90,
  cached_median: 72,
  model_hint: 55,
  brand_estimate: 28,
};

function labelFromScore(score: number): ConfidenceLabel {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function computeDealConfidence(input: DealConfidenceInput): DealConfidenceResult {
  const parts_with_type = input.parts.filter((part) => part.damage_type);
  const parts_real_count = parts_with_type.filter((part) => !isPartEstimate(part)).length;
  const parts_estimate_count = parts_with_type.filter((part) => isPartEstimate(part)).length;
  const parts_total = parts_with_type.length;

  let parts_score = 20;
  if (parts_total > 0) {
    parts_score = Math.round((parts_real_count / parts_total) * 100);
  }

  const market_source = input.market_sell_price_source ?? "brand_estimate";
  const market_score = MARKET_SOURCE_SCORE[market_source] ?? 25;

  let sample_bonus = 0;
  const sample_count = input.median_sample_count ?? 0;
  if (market_source === "model_median") {
    if (sample_count >= 8) sample_bonus = 10;
    else if (sample_count >= 5) sample_bonus = 6;
    else if (sample_count >= 2) sample_bonus = 2;
    else sample_bonus = -15;
  }

  const has_market = input.market_sell_price !== null && input.market_sell_price > 0 ? 0 : -25;

  const confidence_score = Math.max(
    0,
    Math.min(100, Math.round(parts_score * 0.45 + market_score * 0.45 + sample_bonus + has_market)),
  );

  return {
    confidence_score,
    confidence_label: labelFromScore(confidence_score),
    parts_real_count,
    parts_estimate_count,
  };
}
