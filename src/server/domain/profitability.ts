import type { AllegroPart, AnalyzedDevice } from "@/shared/types/domain";
import { computeMedian } from "@/server/domain/parts-shared";
import { isPartEstimate } from "@/server/domain/repair-parts-stubs";
import {
  calculateDealProfit,
  type DealLogistics,
  type DealProfitResult,
} from "@/shared/lib/deal-economics";

interface ProfitabilityInput {
  price_buy: number | null;
  parts: AllegroPart[];
  market_sell_price: number | null;
  repairability_score: number | null;
  repairability_scale: number | null;
  manual_repair_complexity_pct?: number | null;
  logistics?: DealLogistics | null;
}

export type ProfitabilityResult = DealProfitResult;

/** Сумма по типам повреждения: медиана цены на тип (реальные объявления), не минимум. */
export function estimatePartsCost(parts: AllegroPart[]): number | null {
  const parts_with_price = parts.filter((p) => p.price !== null && p.price > 0);
  if (parts_with_price.length === 0) return null;

  const parts_with_type = parts_with_price.filter((p) => p.damage_type);
  if (parts_with_type.length > 0) {
    const parts_by_type = new Map<string, AllegroPart[]>();
    for (const part of parts_with_type) {
      const type = part.damage_type!;
      const bucket = parts_by_type.get(type) ?? [];
      bucket.push(part);
      parts_by_type.set(type, bucket);
    }

    let total = 0;
    for (const type_parts of parts_by_type.values()) {
      const real_parts = type_parts.filter((part) => !isPartEstimate(part));
      const source_parts = real_parts.length > 0 ? real_parts : type_parts;
      const type_median = computeMedian(source_parts.map((part) => part.price ?? 0));
      if (type_median !== null) {
        total += type_median;
      }
    }
    return total > 0 ? total : null;
  }

  const total_median = computeMedian(parts_with_price.map((p) => p.price ?? 0));
  return total_median;
}

export function calculateProfitability(input: ProfitabilityInput): ProfitabilityResult {
  return calculateDealProfit({
    price_buy: input.price_buy,
    parts_cost_estimate: estimatePartsCost(input.parts),
    market_sell_price: input.market_sell_price,
    repairability_score: input.repairability_score,
    repairability_scale: input.repairability_scale,
    manual_repair_complexity_pct: input.manual_repair_complexity_pct,
    logistics: input.logistics,
  });
}

export function enrichDeviceProfitability(
  device: AnalyzedDevice,
  logistics?: DealLogistics | null,
): AnalyzedDevice {
  const result = calculateProfitability({
    price_buy: device.price_buy,
    parts: device.allegro_parts,
    market_sell_price: device.market_sell_price,
    repairability_score: device.repairability_score,
    repairability_scale: device.repairability_scale,
    logistics,
  });

  return { ...device, ...result };
}
