import type { AllegroPart, AnalyzedDevice } from "./types";
import { computeMedian } from "./parts-shared";
import { isPartEstimate } from "./repair-parts-stubs";

interface ProfitabilityInput {
  price_buy: number | null;
  parts: AllegroPart[];
  market_sell_price: number | null;
  repairability_score: number | null;
  repairability_scale: number | null;
}

export interface ProfitabilityResult {
  parts_cost_estimate: number | null;
  profit_estimate: number | null;
  profitability_pct: number | null;
}

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
  const { price_buy, parts, market_sell_price, repairability_score, repairability_scale } = input;

  if (!price_buy || price_buy <= 0) {
    return { parts_cost_estimate: null, profit_estimate: null, profitability_pct: null };
  }

  const parts_cost_estimate = estimatePartsCost(parts);

  if (!market_sell_price) {
    return { parts_cost_estimate, profit_estimate: null, profitability_pct: null };
  }

  // Штраф за низкий ремонтопригодность — добавляем к стоимости ремонта
  let repair_complexity_factor = 1.0;
  if (repairability_score !== null && repairability_scale !== null && repairability_scale > 0) {
    const normalized = repairability_score / repairability_scale;
    // Низкая ремонтопригодность → выше трудозатраты (наценка 10-30%)
    repair_complexity_factor = 1 + (1 - normalized) * 0.3;
  }

  const effective_parts_cost = (parts_cost_estimate ?? 0) * repair_complexity_factor;
  // Закладываем 15% на непредвиденные расходы и работу мастера
  const total_costs = price_buy + effective_parts_cost * 1.15;

  const profit_estimate = Math.round(market_sell_price - total_costs);
  // Рентабельность вложений считаем от total_costs (цена покупки + затраты на
  // ремонт с наценкой), а не только от price_buy: инвестор вкладывает деньги
  // и в покупку, и в ремонт, поэтому ROI должен делиться на всю вложенную
  // сумму. Деление только на price_buy искусственно завышало % рентабельности
  // для объявлений с дорогим ремонтом (тот же profit_estimate делился на
  // меньшую базу).
  const profitability_pct = Math.round((profit_estimate / total_costs) * 100);

  return {
    parts_cost_estimate: parts_cost_estimate !== null ? Math.round(effective_parts_cost) : null,
    profit_estimate,
    profitability_pct,
  };
}

export function enrichDeviceProfitability(device: AnalyzedDevice): AnalyzedDevice {
  const result = calculateProfitability({
    price_buy: device.price_buy,
    parts: device.allegro_parts,
    market_sell_price: device.market_sell_price,
    repairability_score: device.repairability_score,
    repairability_scale: device.repairability_scale,
  });

  return { ...device, ...result };
}
