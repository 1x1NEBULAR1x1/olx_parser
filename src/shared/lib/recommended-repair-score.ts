import { isSuspiciousListing } from "@/shared/lib/listing-flags";

const SCORE_MIN = 0;
const SCORE_MAX = 100;

const WEIGHT_PROFITABILITY = 0.28;
const WEIGHT_REPAIR_SIMPLICITY = 0.27;
const WEIGHT_REPAIRABILITY = 0.2;
const WEIGHT_LIQUIDITY = 0.15;
const WEIGHT_PROFIT_ABSOLUTE = 0.1;

const EASY_DAMAGE_TYPES = new Set([
  "screen",
  "battery",
  "back_cover",
  "charging_port",
  "buttons",
]);

const MEDIUM_DAMAGE_TYPES = new Set([
  "camera",
  "speaker",
  "microphone",
  "sim_slot",
]);

const HARD_DAMAGE_TYPES = new Set([
  "water_damage",
  "locked",
  "software",
  "body",
  "frame",
  "unknown",
]);

export interface DeviceScoreInput {
  price_buy: number | null;
  damage_types: string[];
  repairability_score: number | null;
  repairability_scale: number | null;
  liquidity_score: number | null;
  profit_estimate: number | null;
  profitability_pct: number | null;
  confidence_score: number | null;
  risk_adjusted_profit: number | null;
  risk_adjusted_profitability_pct: number | null;
  parts_cost_estimate: number | null;
}

function clampScore(value: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));
}

function normalizeRepairability(device: DeviceScoreInput): number | null {
  if (device.repairability_score === null || !device.repairability_scale) {
    return null;
  }
  return (device.repairability_score / device.repairability_scale) * SCORE_MAX;
}

function scoreProfitabilityPct(profitability_pct: number | null): number {
  if (profitability_pct === null) return 0;
  if (profitability_pct < 0) return clampScore(15 + profitability_pct * 0.8);
  if (profitability_pct < 10) return profitability_pct * 4;
  if (profitability_pct < 20) return 40 + (profitability_pct - 10) * 3;
  if (profitability_pct <= 45) return 70 + (profitability_pct - 20) * 1.2;
  if (profitability_pct <= 65) return 100 - (profitability_pct - 45) * 1.5;
  return clampScore(70 - (profitability_pct - 65) * 2);
}

function scoreRepairSimplicity(damage_types: string[]): number {
  if (isSuspiciousListing(damage_types)) return 5;

  if (damage_types.length === 0) return 35;

  let score = 92;
  score -= Math.max(0, damage_types.length - 1) * 16;

  for (const damage_type of damage_types) {
    if (EASY_DAMAGE_TYPES.has(damage_type)) {
      score += 4;
    } else if (MEDIUM_DAMAGE_TYPES.has(damage_type)) {
      score -= 8;
    } else if (HARD_DAMAGE_TYPES.has(damage_type)) {
      score -= 30;
    } else {
      score -= 12;
    }
  }

  return clampScore(score);
}

function scoreProfitAbsolute(profit_estimate: number | null): number {
  if (profit_estimate === null) return 0;
  if (profit_estimate < 0) return clampScore(20 + profit_estimate * 0.4);
  if (profit_estimate < 80) return profit_estimate * 0.55;
  if (profit_estimate <= 600) return 44 + (profit_estimate - 80) * (56 / 520);
  if (profit_estimate <= 1200) return 100 - (profit_estimate - 600) * 0.06;
  return clampScore(64 - (profit_estimate - 1200) * 0.015);
}

function scorePartsRatio(device: DeviceScoreInput): number {
  const price_buy = device.price_buy;
  const parts_cost = device.parts_cost_estimate;
  if (!price_buy || price_buy <= 0 || parts_cost === null) return 50;

  const ratio = parts_cost / price_buy;
  if (ratio > 1.1) return 10;
  if (ratio > 0.75) return 35;
  if (ratio > 0.45) return 65;
  return 90;
}

function blendRepairSimplicity(damage_types: string[], device: DeviceScoreInput): number {
  const simplicity = scoreRepairSimplicity(damage_types);
  const parts_ratio = scorePartsRatio(device);
  return simplicity * 0.72 + parts_ratio * 0.28;
}

export function computeRecommendedRepairScore(device: DeviceScoreInput): number {
  const profitability_score = scoreProfitabilityPct(
    device.risk_adjusted_profitability_pct ?? device.profitability_pct,
  );
  const repair_simplicity_score = blendRepairSimplicity(device.damage_types, device);
  const repairability_score = normalizeRepairability(device) ?? 45;
  const liquidity_score = device.liquidity_score ?? 40;
  const profit_absolute_score = scoreProfitAbsolute(
    device.risk_adjusted_profit ?? device.profit_estimate,
  );

  const confidence_factor = device.confidence_score !== null
    ? 0.85 + (device.confidence_score / 100) * 0.15
    : 1;

  const total =
    (profitability_score * WEIGHT_PROFITABILITY
    + repair_simplicity_score * WEIGHT_REPAIR_SIMPLICITY
    + repairability_score * WEIGHT_REPAIRABILITY
    + liquidity_score * WEIGHT_LIQUIDITY
    + profit_absolute_score * WEIGHT_PROFIT_ABSOLUTE) * confidence_factor;

  return Math.round(total * 10) / 10;
}

export function compareRecommendedRepair(a: DeviceScoreInput, b: DeviceScoreInput): number {
  const score_diff = computeRecommendedRepairScore(b) - computeRecommendedRepairScore(a);
  if (score_diff !== 0) return score_diff;

  const profitability_diff = (b.risk_adjusted_profitability_pct ?? b.profitability_pct ?? -999)
    - (a.risk_adjusted_profitability_pct ?? a.profitability_pct ?? -999);
  if (profitability_diff !== 0) return profitability_diff;

  return (b.risk_adjusted_profit ?? b.profit_estimate ?? -999)
    - (a.risk_adjusted_profit ?? a.profit_estimate ?? -999);
}
