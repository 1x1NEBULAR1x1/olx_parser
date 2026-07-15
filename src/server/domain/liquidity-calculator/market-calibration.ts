import { MAX_LIQUIDITY_SCORE, MIN_LIQUIDITY_SCORE } from "./constants";

export interface BrandMarketRecord {
  brand_name: string;
  sales_count_30d: number;
  active_listings_count: number;
  median_price: number;
  p25_price: number;
  p75_price: number;
  avg_days_to_sell: number;
}

export interface ModelMarketRecord {
  brand_name: string;
  model_name: string;
  release_year: number;
  condition_score: number;
  storage_gb: number;
  ram_gb: number;
  sale_price: number;
  sold_in_days: number;
}

export interface MarketCalibrationSnapshot {
  brand_demand_score: Record<string, number>;
  market_depth_by_brand: Record<
    string,
    { monthly_sales_count: number; active_listings_count: number; avg_days_to_sell: number }
  >;
  model_median_price: Record<string, number>;
}

function clampScore(raw_score: number): number {
  return Math.max(MIN_LIQUIDITY_SCORE, Math.min(MAX_LIQUIDITY_SCORE, raw_score));
}

function toModelKey(brand_name: string, model_name: string): string {
  return `${brand_name.trim().toLowerCase()}::${model_name.trim().toLowerCase()}`;
}

export class MarketCalibrationService {
  buildSnapshot(
    brand_records: BrandMarketRecord[],
    model_records: ModelMarketRecord[],
  ): MarketCalibrationSnapshot {
    return {
      brand_demand_score: this.buildBrandDemandScores(brand_records),
      market_depth_by_brand: this.buildMarketDepthByBrand(brand_records),
      model_median_price: this.buildModelMedianPrices(model_records),
    };
  }

  buildBrandDemandScores(brand_records: BrandMarketRecord[]): Record<string, number> {
    const max_sales_count = Math.max(...brand_records.map((row) => row.sales_count_30d), 1);
    const result: Record<string, number> = {};

    for (const row of brand_records) {
      const normalized_sales = row.sales_count_30d / max_sales_count;
      const demand_supply_ratio = row.active_listings_count > 0
        ? row.sales_count_30d / row.active_listings_count
        : 0;
      const velocity_bonus = row.avg_days_to_sell > 0
        ? Math.min(1, 10 / row.avg_days_to_sell)
        : 0;

      const score = 35 + normalized_sales * 40 + demand_supply_ratio * 20 + velocity_bonus * 5;
      result[row.brand_name.toLowerCase()] = clampScore(score);
    }

    return result;
  }

  buildMarketDepthByBrand(
    brand_records: BrandMarketRecord[],
  ): Record<string, { monthly_sales_count: number; active_listings_count: number; avg_days_to_sell: number }> {
    const result: Record<
      string,
      { monthly_sales_count: number; active_listings_count: number; avg_days_to_sell: number }
    > = {};

    for (const row of brand_records) {
      result[row.brand_name.toLowerCase()] = {
        monthly_sales_count: row.sales_count_30d,
        active_listings_count: row.active_listings_count,
        avg_days_to_sell: row.avg_days_to_sell,
      };
    }

    return result;
  }

  buildModelMedianPrices(model_records: ModelMarketRecord[]): Record<string, number> {
    const grouped_prices: Record<string, number[]> = {};

    for (const row of model_records) {
      const model_key = toModelKey(row.brand_name, row.model_name);
      grouped_prices[model_key] ??= [];
      grouped_prices[model_key].push(row.sale_price);
    }

    const result: Record<string, number> = {};
    for (const [model_key, prices] of Object.entries(grouped_prices)) {
      const sorted_prices = [...prices].sort((a, b) => a - b);
      const center_index = Math.floor(sorted_prices.length / 2);
      result[model_key] = sorted_prices[center_index] ?? 0;
    }

    return result;
  }
}
