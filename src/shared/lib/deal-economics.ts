import type { AnalyzedDevice } from "@/shared/types/domain";
import type { DealLogistics } from "@/shared/types/api-contracts";

export type { DealLogistics };

export const DEFAULT_DEAL_LOGISTICS: DealLogistics = {
  shipping_parts_pln: 14,
  shipping_to_repair_pln: 18,
  shipping_to_customer_pln: 18,
  repair_labor_base_pln: 0,
};

const PLATFORM_FEE_RATE = 0.05;
const NEGOTIABLE_DISCOUNT_RATE = 0.05;
const HOLDING_DAYS = 14;
const DAILY_HOLDING_RATE = 0.0005;
const PARTS_OVERHEAD_RATE = 1.15;

export function getLogisticsTotal(logistics: DealLogistics | null | undefined): number {
  if (!logistics) return 0;
  return logistics.shipping_parts_pln
    + logistics.shipping_to_repair_pln
    + logistics.shipping_to_customer_pln
    + logistics.repair_labor_base_pln;
}

export function getRepairComplexityFactor(
  repairability_score: number | null,
  repairability_scale: number | null,
  manual_repair_complexity_pct?: number | null,
): number {
  let factor = 1;
  if (repairability_score !== null && repairability_scale !== null && repairability_scale > 0) {
    const normalized = repairability_score / repairability_scale;
    factor = 1 + (1 - normalized) * 0.3;
  }
  if (manual_repair_complexity_pct !== null && manual_repair_complexity_pct !== undefined) {
    factor *= 1 + manual_repair_complexity_pct / 100;
  }
  return factor;
}

export interface DealProfitInput {
  price_buy: number | null;
  parts_cost_estimate: number | null;
  market_sell_price: number | null;
  repairability_score: number | null;
  repairability_scale: number | null;
  manual_repair_complexity_pct?: number | null;
  logistics?: DealLogistics | null;
  /** false — parts_cost_estimate уже с коэффициентом сложности (клиент). */
  apply_complexity?: boolean;
}

export interface DealProfitResult {
  parts_cost_estimate: number | null;
  profit_estimate: number | null;
  profitability_pct: number | null;
}

export function calculateDealProfit(input: DealProfitInput): DealProfitResult {
  const { price_buy, market_sell_price } = input;

  if (!price_buy || price_buy <= 0) {
    return {
      parts_cost_estimate: input.parts_cost_estimate,
      profit_estimate: null,
      profitability_pct: null,
    };
  }

  if (!market_sell_price) {
    return {
      parts_cost_estimate: input.parts_cost_estimate,
      profit_estimate: null,
      profitability_pct: null,
    };
  }

  const complexity = input.apply_complexity === false
    ? 1
    : getRepairComplexityFactor(
      input.repairability_score,
      input.repairability_scale,
      input.manual_repair_complexity_pct,
    );
  const effective_parts_cost = (input.parts_cost_estimate ?? 0) * complexity;
  const logistics_total = getLogisticsTotal(input.logistics);
  const total_costs = price_buy + effective_parts_cost * PARTS_OVERHEAD_RATE + logistics_total;
  const profit_estimate = Math.round(market_sell_price - total_costs);
  const profitability_pct = Math.round((profit_estimate / total_costs) * 100);

  return {
    parts_cost_estimate: input.parts_cost_estimate !== null ? Math.round(effective_parts_cost) : null,
    profit_estimate,
    profitability_pct,
  };
}

function liquiditySellFactor(liquidity_score: number | null): number {
  if (liquidity_score === null) return 0.75;
  if (liquidity_score >= 75) return 1;
  if (liquidity_score >= 55) return 0.92;
  if (liquidity_score >= 35) return 0.82;
  return 0.68;
}

function confidenceFactor(confidence_score: number | null): number {
  if (confidence_score === null) return 0.88;
  if (confidence_score >= 70) return 1;
  if (confidence_score >= 45) return 0.88;
  return 0.72;
}

export interface RiskAdjustedDealInput extends DealProfitInput {
  is_negotiable: boolean | null;
  liquidity_score: number | null;
  confidence_score: number | null;
}

export interface RiskAdjustedDealResult extends DealProfitResult {
  risk_adjusted_profit: number | null;
  risk_adjusted_profitability_pct: number | null;
}

export function calculateRiskAdjustedDeal(input: RiskAdjustedDealInput): RiskAdjustedDealResult {
  const effective_price_buy = input.price_buy !== null && input.is_negotiable
    ? Math.round(input.price_buy * (1 - NEGOTIABLE_DISCOUNT_RATE))
    : input.price_buy;

  const base = calculateDealProfit({
    ...input,
    price_buy: effective_price_buy,
  });

  if (
    base.profit_estimate === null
    || effective_price_buy === null
    || effective_price_buy <= 0
    || input.market_sell_price === null
  ) {
    return {
      ...base,
      risk_adjusted_profit: base.profit_estimate,
      risk_adjusted_profitability_pct: base.profitability_pct,
    };
  }

  const complexity = input.apply_complexity === false
    ? 1
    : getRepairComplexityFactor(
      input.repairability_score,
      input.repairability_scale,
      input.manual_repair_complexity_pct,
    );
  const parts_cost = (input.parts_cost_estimate ?? 0) * complexity;
  const logistics_total = getLogisticsTotal(input.logistics);
  const total_costs = effective_price_buy + parts_cost * PARTS_OVERHEAD_RATE + logistics_total;
  const platform_fee = Math.round(input.market_sell_price * PLATFORM_FEE_RATE);
  const net_proceeds = input.market_sell_price - platform_fee;
  const holding_cost = Math.round(total_costs * DAILY_HOLDING_RATE * HOLDING_DAYS);
  const raw_profit = net_proceeds - total_costs - holding_cost;
  const risk_adjusted_profit = Math.round(
    raw_profit * liquiditySellFactor(input.liquidity_score) * confidenceFactor(input.confidence_score),
  );
  const risk_adjusted_profitability_pct = total_costs > 0
    ? Math.round((risk_adjusted_profit / total_costs) * 100)
    : null;

  return {
    ...base,
    risk_adjusted_profit,
    risk_adjusted_profitability_pct,
  };
}

export function applyDealLogistics<T extends AnalyzedDevice>(
  device: T,
  logistics: DealLogistics | null | undefined,
): T {
  const economics = calculateRiskAdjustedDeal({
    price_buy: device.price_buy,
    parts_cost_estimate: device.parts_cost_estimate,
    market_sell_price: device.market_sell_price,
    repairability_score: device.repairability_score,
    repairability_scale: device.repairability_scale,
    is_negotiable: device.is_negotiable,
    liquidity_score: device.liquidity_score,
    confidence_score: device.confidence_score,
    logistics,
    apply_complexity: false,
  });

  return {
    ...device,
    profit_estimate: economics.profit_estimate,
    profitability_pct: economics.profitability_pct,
    risk_adjusted_profit: economics.risk_adjusted_profit,
    risk_adjusted_profitability_pct: economics.risk_adjusted_profitability_pct,
  };
}
