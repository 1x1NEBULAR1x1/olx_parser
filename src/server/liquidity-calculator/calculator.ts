import {
  APPLE_RAM_EQUIVALENT_MULTIPLIER,
  APPLE_RAM_MIN_EFFECTIVE_GB,
  AGE_DECAY_PER_YEAR,
  AGE_FLOOR_SCORE,
  AGE_FRESH_DEVICE_BONUS,
  ANNUAL_DEPRECIATION_BY_BRAND,
  BATTERY_HEALTH_PENALTY_PER_PERCENT_BELOW_90,
  BEST_PRICE_MAX_RATIO,
  BEST_PRICE_MIN_RATIO,
  BEST_PRICE_STEP_PLN,
  BOX_AND_ACCESSORIES_BONUS_SCORE,
  BRAND_DEMAND_SCORE,
  BRAND_FALLBACK_DEMAND_SCORE,
  CURRENT_MARKET_YEAR,
  DEMAND_TO_SUPPLY_GOOD_RATIO,
  DEMAND_TO_SUPPLY_STRONG_RATIO,
  DEFAULT_ANNUAL_DEPRECIATION,
  ESIM_BONUS_SCORE,
  FIVE_G_BONUS_SCORE,
  LIQUIDITY_WEIGHTS,
  MAX_LIQUIDITY_SCORE,
  MIN_LIQUIDITY_SCORE,
  MIN_USED_TO_NEW_RATIO_BY_AGE,
  NEW_TO_USED_PRICE_OVERPRICING_PENALTY_MULTIPLIER,
  NEW_TO_USED_PRICE_SCORE_FLOOR,
  NEW_TO_USED_PRICE_TOLERANCE_RATIO,
  OLX_2026_MARKET_SNAPSHOT_BY_BRAND,
  OPTIMAL_PRICE_TO_MEDIAN_RATIO,
  POLAND_2026_BUYING_POWER,
  PRICE_SCORE_FLOOR,
  PRICE_SENSITIVITY_FACTOR,
  RAM_SCORE_BY_GB,
  SERIES_KEYWORD_MULTIPLIER,
  STORAGE_SCORE_BY_GB,
} from "./constants";
import { getKimovilScoresByModel } from "./kimovil-fetcher";
import { containsKeyword } from "../text-match";

export interface DeviceLiquidityInput {
  brand_name: string;
  model_name: string;
  release_year: number;
  condition_score: number;
  storage_gb?: number;
  ram_gb?: number;
  has_5g?: boolean;
  has_esim?: boolean;
  has_box_and_accessories?: boolean;
  battery_health_percent?: number;
  market_median_price?: number;
  market_avg_price?: number;
  new_device_price?: number;
  monthly_sales_count?: number;
  active_listings_count?: number;
  geek_score?: number;
  user_score?: number;
}

export interface LiquidityBreakdown {
  brand_series_score: number;
  age_score: number;
  condition_score: number;
  hardware_score: number;
  price_score: number;
  used_to_new_price_score: number | null;
  market_depth_score: number;
  geek_score: number | null;
  user_score: number | null;
  combined_expert_score: number | null;
}

export interface LiquidityResult {
  liquidity_score: number;
  liquidity_label: "низкая" | "средняя" | "высокая" | "очень высокая";
  breakdown: LiquidityBreakdown;
}

export interface BestPriceResult {
  best_price: number;
  target_liquidity_score: number;
  expected_liquidity_score: number;
  quick_sale_price: number;
  premium_price: number;
}

function clampScore(raw_score: number): number {
  return Math.max(MIN_LIQUIDITY_SCORE, Math.min(MAX_LIQUIDITY_SCORE, raw_score));
}

function roundScore(raw_score: number): number {
  return Math.round(raw_score * 10) / 10;
}

function normalizeBrandName(brand_name: string): string {
  return brand_name.trim().toLowerCase();
}

function getBrandScore(brand_name: string): number {
  const normalized_brand = brand_name.trim().toLowerCase();
  return BRAND_DEMAND_SCORE[normalized_brand] ?? BRAND_FALLBACK_DEMAND_SCORE;
}

// Модели вида a0x..a9x (Samsung Galaxy A-серия) кодируются в
// SERIES_KEYWORD_MULTIPLIER как префиксы "a0".."a7" — за префиксом всегда
// идут ещё цифры (a14, a54...), поэтому для них нужен обычный prefix-match,
// а не сопоставление по целому слову.
function isNumericSeriesPrefix(keyword: string): boolean {
  return /^a[0-9]$/.test(keyword);
}

function getSeriesMultiplier(model_name: string): number {
  const normalized_model = model_name.toLowerCase();
  for (const rule of SERIES_KEYWORD_MULTIPLIER) {
    // Раньше здесь был обычный includes(), из-за чего короткие ключевые слова
    // ("fe", "se") ложно матчились внутри случайных слов — например "fe"
    // внутри "defekt" или "se" внутри "zresetowany" — и подменяли правильный
    // мультипликатор (или блокировали более специфичное совпадение, идущее
    // ниже в списке, т.к. цикл останавливается на первом совпадении).
    const is_match = isNumericSeriesPrefix(rule.keyword)
      ? normalized_model.includes(rule.keyword)
      : containsKeyword(normalized_model, rule.keyword);
    if (is_match) {
      return rule.multiplier;
    }
  }
  return 1;
}

function normalizeRamByBrand(brand_name: string, ram_gb?: number): number {
  if (!ram_gb || ram_gb <= 0) {
    return 0;
  }

  if (normalizeBrandName(brand_name) !== "apple") {
    return ram_gb;
  }

  return Math.max(APPLE_RAM_MIN_EFFECTIVE_GB, ram_gb * APPLE_RAM_EQUIVALENT_MULTIPLIER);
}

function getAgeScore(release_year: number): number {
  const device_age = Math.max(0, CURRENT_MARKET_YEAR - release_year);
  const base_score = MAX_LIQUIDITY_SCORE - device_age * AGE_DECAY_PER_YEAR;
  const fresh_bonus = device_age <= 1 ? AGE_FRESH_DEVICE_BONUS : 0;
  return clampScore(Math.max(AGE_FLOOR_SCORE, base_score + fresh_bonus));
}

function getHardwareScore(input: DeviceLiquidityInput): number {
  const storage_score =
    STORAGE_SCORE_BY_GB.find((row) => (input.storage_gb ?? 0) >= row.min_storage_gb)?.score ?? 50;
  const normalized_ram_gb = normalizeRamByBrand(input.brand_name, input.ram_gb);
  const ram_score =
    RAM_SCORE_BY_GB.find((row) => normalized_ram_gb >= row.min_ram_gb)?.score ?? 50;

  let extra_feature_bonus = 0;
  if (input.has_5g) {
    extra_feature_bonus += FIVE_G_BONUS_SCORE;
  }
  if (input.has_esim) {
    extra_feature_bonus += ESIM_BONUS_SCORE;
  }
  if (input.has_box_and_accessories) {
    extra_feature_bonus += BOX_AND_ACCESSORIES_BONUS_SCORE;
  }

  let battery_penalty = 0;
  if (typeof input.battery_health_percent === "number" && input.battery_health_percent < 90) {
    battery_penalty =
      (90 - input.battery_health_percent) * BATTERY_HEALTH_PENALTY_PER_PERCENT_BELOW_90;
  }

  const hardware_score = (storage_score * 0.57 + ram_score * 0.43) + extra_feature_bonus - battery_penalty;
  return clampScore(hardware_score);
}

function getPriceScore(ask_price: number, market_median_price?: number): number {
  if (!market_median_price || market_median_price <= 0) {
    return 70;
  }

  const ratio_to_market = ask_price / market_median_price;
  const deviation_from_optimal = Math.abs(ratio_to_market - OPTIMAL_PRICE_TO_MEDIAN_RATIO);
  const penalty = deviation_from_optimal * PRICE_SENSITIVITY_FACTOR;
  return clampScore(Math.max(PRICE_SCORE_FLOOR, MAX_LIQUIDITY_SCORE - penalty));
}

function getAnnualDepreciationRateByBrand(brand_name: string): number {
  return ANNUAL_DEPRECIATION_BY_BRAND[normalizeBrandName(brand_name)] ?? DEFAULT_ANNUAL_DEPRECIATION;
}

function getUsedToNewRatioFloorByAge(device_age: number): number {
  for (const row of MIN_USED_TO_NEW_RATIO_BY_AGE) {
    if (device_age >= row.min_age) {
      return row.ratio_floor;
    }
  }
  return 0.14;
}

function getUsedToNewPriceScore(input: DeviceLiquidityInput, ask_price: number): number | null {
  if (!input.new_device_price || input.new_device_price <= 0) {
    return null;
  }

  const device_age = Math.max(0, CURRENT_MARKET_YEAR - input.release_year);
  const annual_depreciation = getAnnualDepreciationRateByBrand(input.brand_name);
  const expected_ratio_without_floor = Math.pow(1 - annual_depreciation, device_age + 0.35);
  const expected_ratio = Math.max(
    getUsedToNewRatioFloorByAge(device_age),
    expected_ratio_without_floor,
  );

  const ask_to_new_ratio = ask_price / input.new_device_price;
  const deviation_ratio = Math.abs(ask_to_new_ratio - expected_ratio);
  const effective_deviation = Math.max(0, deviation_ratio - NEW_TO_USED_PRICE_TOLERANCE_RATIO);

  const is_overpriced_vs_curve = ask_to_new_ratio > expected_ratio;
  const side_penalty_multiplier = is_overpriced_vs_curve
    ? NEW_TO_USED_PRICE_OVERPRICING_PENALTY_MULTIPLIER
    : 1;

  const penalty = effective_deviation * 220 * side_penalty_multiplier;
  return clampScore(Math.max(NEW_TO_USED_PRICE_SCORE_FLOOR, MAX_LIQUIDITY_SCORE - penalty));
}

function getMarketDepthScore(monthly_sales_count?: number, active_listings_count?: number): number {
  if (!monthly_sales_count || !active_listings_count || active_listings_count <= 0) {
    return 65;
  }

  const demand_to_supply_ratio = monthly_sales_count / active_listings_count;
  if (demand_to_supply_ratio >= DEMAND_TO_SUPPLY_STRONG_RATIO) {
    return 95;
  }
  if (demand_to_supply_ratio >= DEMAND_TO_SUPPLY_GOOD_RATIO) {
    return 82;
  }

  return clampScore(45 + demand_to_supply_ratio * 70);
}

function getGeekScore(geek_score?: number): number | null {
  if (typeof geek_score === "number") {
    return clampScore(geek_score);
  }

  return null;
}

function getUserScore(user_score?: number): number | null {
  if (typeof user_score === "number") {
    return clampScore(user_score);
  }

  return null;
}

function getCombinedExpertScore(geek_score: number | null, user_score: number | null): number | null {
  if (typeof geek_score === "number" && typeof user_score === "number") {
    return clampScore((geek_score + user_score) / 2);
  }

  if (typeof geek_score === "number") {
    return geek_score;
  }

  if (typeof user_score === "number") {
    return user_score;
  }

  return null;
}

function getLiquidityLabel(liquidity_score: number): LiquidityResult["liquidity_label"] {
  if (liquidity_score >= 85) {
    return "очень высокая";
  }
  if (liquidity_score >= 70) {
    return "высокая";
  }
  if (liquidity_score >= 50) {
    return "средняя";
  }
  return "низкая";
}

function getDefaultMarketMedianPrice(input: DeviceLiquidityInput): number {
  if (input.market_median_price && input.market_median_price > 0) {
    return input.market_median_price;
  }

  if (input.market_avg_price && input.market_avg_price > 0) {
    return input.market_avg_price * 0.96;
  }

  return POLAND_2026_BUYING_POWER.estimated_median_net_salary_pln *
    POLAND_2026_BUYING_POWER.strong_mass_market_price_share_of_net_salary;
}

function getDefaultMarketDepth(input: DeviceLiquidityInput): {
  monthly_sales_count: number;
  active_listings_count: number;
} {
  if (input.monthly_sales_count && input.active_listings_count) {
    return {
      monthly_sales_count: input.monthly_sales_count,
      active_listings_count: input.active_listings_count,
    };
  }

  const normalized_brand = normalizeBrandName(input.brand_name);
  const market_row = OLX_2026_MARKET_SNAPSHOT_BY_BRAND[normalized_brand];

  if (market_row) {
    return {
      monthly_sales_count: market_row.monthly_sales_count,
      active_listings_count: market_row.active_listings_count,
    };
  }

  return {
    monthly_sales_count: 900,
    active_listings_count: 1900,
  };
}

function calculateDeviceLiquidity(input: DeviceLiquidityInput, ask_price: number): LiquidityResult {
  const market_median_price = getDefaultMarketMedianPrice(input);
  const market_depth = getDefaultMarketDepth(input);

  const brand_series_score = clampScore(getBrandScore(input.brand_name) * getSeriesMultiplier(input.model_name));
  const age_score = getAgeScore(input.release_year);
  const condition_score = clampScore(input.condition_score);
  const hardware_score = getHardwareScore(input);
  const price_score = getPriceScore(ask_price, market_median_price);
  const used_to_new_price_score = getUsedToNewPriceScore(input, ask_price);
  const market_depth_score = getMarketDepthScore(
    market_depth.monthly_sales_count,
    market_depth.active_listings_count,
  );
  const geek_score = getGeekScore(input.geek_score);
  const user_score = getUserScore(input.user_score);
  const combined_expert_score = getCombinedExpertScore(geek_score, user_score);

  let weighted_sum =
    brand_series_score * LIQUIDITY_WEIGHTS.brand_series_score +
    age_score * LIQUIDITY_WEIGHTS.age_score +
    condition_score * LIQUIDITY_WEIGHTS.condition_score +
    hardware_score * LIQUIDITY_WEIGHTS.hardware_score +
    price_score * LIQUIDITY_WEIGHTS.price_score +
    (used_to_new_price_score ?? 0) * LIQUIDITY_WEIGHTS.used_to_new_price_score +
    market_depth_score * LIQUIDITY_WEIGHTS.market_depth_score;
  let total_weight =
    LIQUIDITY_WEIGHTS.brand_series_score +
    LIQUIDITY_WEIGHTS.age_score +
    LIQUIDITY_WEIGHTS.condition_score +
    LIQUIDITY_WEIGHTS.hardware_score +
    LIQUIDITY_WEIGHTS.price_score +
    LIQUIDITY_WEIGHTS.market_depth_score;

  if (typeof used_to_new_price_score === "number") {
    total_weight += LIQUIDITY_WEIGHTS.used_to_new_price_score;
  }

  if (typeof combined_expert_score === "number") {
    weighted_sum += combined_expert_score * LIQUIDITY_WEIGHTS.geek_score;
    total_weight += LIQUIDITY_WEIGHTS.geek_score;
  }

  const weighted_score = total_weight > 0 ? weighted_sum / total_weight : 0;

  const liquidity_score = roundScore(clampScore(weighted_score));

  return {
    liquidity_score,
    liquidity_label: getLiquidityLabel(liquidity_score),
    breakdown: {
      brand_series_score: roundScore(brand_series_score),
      age_score: roundScore(age_score),
      condition_score: roundScore(condition_score),
      hardware_score: roundScore(hardware_score),
      price_score: roundScore(price_score),
      used_to_new_price_score:
        typeof used_to_new_price_score === "number" ? roundScore(used_to_new_price_score) : null,
      market_depth_score: roundScore(market_depth_score),
      geek_score: typeof geek_score === "number" ? roundScore(geek_score) : null,
      user_score: typeof user_score === "number" ? roundScore(user_score) : null,
      combined_expert_score:
        typeof combined_expert_score === "number" ? roundScore(combined_expert_score) : null,
    },
  };
}

export class DeviceLiquidityScenario {
  private readonly input: DeviceLiquidityInput;

  constructor(input: DeviceLiquidityInput) {
    this.input = input;
  }

  avg(): LiquidityResult {
    const median_price = getDefaultMarketMedianPrice(this.input);
    return calculateDeviceLiquidity(this.input, median_price);
  }

  byPrice(ask_price: number): LiquidityResult {
    return calculateDeviceLiquidity(this.input, ask_price);
  }

  async avgOnline(): Promise<LiquidityResult> {
    const online_input = await this.enrichInputWithKimovilScore();
    const median_price = getDefaultMarketMedianPrice(online_input);
    return calculateDeviceLiquidity(online_input, median_price);
  }

  async byPriceOnline(ask_price: number): Promise<LiquidityResult> {
    const online_input = await this.enrichInputWithKimovilScore();
    return calculateDeviceLiquidity(online_input, ask_price);
  }

  bestPrice(target_liquidity_score = 82): BestPriceResult {
    const safe_target_score = clampScore(target_liquidity_score);
    const market_median_price = getDefaultMarketMedianPrice(this.input);
    const min_price = market_median_price * BEST_PRICE_MIN_RATIO;
    const max_price = market_median_price * BEST_PRICE_MAX_RATIO;

    let current_price = min_price;
    let best_price = market_median_price * OPTIMAL_PRICE_TO_MEDIAN_RATIO;
    let closest_score_gap = Number.POSITIVE_INFINITY;
    let expected_liquidity_score = this.byPrice(best_price).liquidity_score;

    while (current_price <= max_price) {
      const current_result = this.byPrice(current_price);
      const current_gap = Math.abs(current_result.liquidity_score - safe_target_score);

      if (current_gap < closest_score_gap) {
        closest_score_gap = current_gap;
        best_price = current_price;
        expected_liquidity_score = current_result.liquidity_score;
      }

      current_price += BEST_PRICE_STEP_PLN;
    }

    return {
      best_price: Math.round(best_price),
      target_liquidity_score: roundScore(safe_target_score),
      expected_liquidity_score: roundScore(expected_liquidity_score),
      quick_sale_price: Math.round(market_median_price * 0.9),
      premium_price: Math.round(market_median_price * 1.04),
    };
  }

  async bestPriceOnline(target_liquidity_score = 82): Promise<BestPriceResult> {
    const online_input = await this.enrichInputWithKimovilScore();
    return new DeviceLiquidityScenario(online_input).bestPrice(target_liquidity_score);
  }

  private async enrichInputWithKimovilScore(): Promise<DeviceLiquidityInput> {
    if (typeof this.input.geek_score === "number" || typeof this.input.user_score === "number") {
      return this.input;
    }

    const kimovil_scores = await getKimovilScoresByModel(this.input.model_name);
    if (
      typeof kimovil_scores.geek_score !== "number" &&
      typeof kimovil_scores.user_score !== "number"
    ) {
      return this.input;
    }

    return {
      ...this.input,
      geek_score: kimovil_scores.geek_score ?? undefined,
      user_score: kimovil_scores.user_score ?? undefined,
    };
  }
}

export class LiquidityCalculator {
  calculate(input: DeviceLiquidityInput): DeviceLiquidityScenario {
    return new DeviceLiquidityScenario(input);
  }
}
