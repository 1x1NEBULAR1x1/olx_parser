export const CURRENT_MARKET_YEAR = 2026;

export const MIN_LIQUIDITY_SCORE = 0;
export const MAX_LIQUIDITY_SCORE = 100;

export const POLAND_2026_BRAND_MARKET_SHARE: Record<string, number> = {
  apple: 29.8,
  samsung: 28,
  xiaomi: 13,
  google: 6.3,
  motorola: 6.2,
  oppo: 2.9,
  realme: 2.6,
  honor: 2.1,
  huawei: 1.7,
  oneplus: 1.4,
  other: 6,
};

export const BRAND_DEMAND_SCORE: Record<string, number> = {
  apple: 94,
  samsung: 92,
  xiaomi: 82,
  redmi: 80,
  poco: 78,
  google: 76,
  motorola: 75,
  oneplus: 72,
  honor: 70,
  realme: 69,
  oppo: 67,
  huawei: 62,
  sony: 58,
  vivo: 58,
  nokia: 50,
  infinix: 57,
  tecno: 55,
};

export const BRAND_FALLBACK_DEMAND_SCORE = 60;

export const SERIES_KEYWORD_MULTIPLIER: Array<{ keyword: string; multiplier: number }> = [
  { keyword: "ultra", multiplier: 1.1 },
  { keyword: "pro max", multiplier: 1.11 },
  { keyword: "pro+", multiplier: 1.08 },
  { keyword: "pro", multiplier: 1.06 },
  { keyword: "plus", multiplier: 1.04 },
  { keyword: "fe", multiplier: 1.01 },
  { keyword: "note", multiplier: 1.01 },
  { keyword: "lite", multiplier: 0.93 },
  { keyword: "a0", multiplier: 0.88 },
  { keyword: "a1", multiplier: 0.89 },
  { keyword: "a2", multiplier: 0.91 },
  { keyword: "a3", multiplier: 0.94 },
  { keyword: "a5", multiplier: 0.98 },
  { keyword: "a7", multiplier: 1.01 },
  { keyword: "se", multiplier: 0.97 },
  { keyword: "mini", multiplier: 0.93 },
];

export const STORAGE_SCORE_BY_GB: Array<{ min_storage_gb: number; score: number }> = [
  { min_storage_gb: 1000, score: 96 },
  { min_storage_gb: 512, score: 92 },
  { min_storage_gb: 256, score: 88 },
  { min_storage_gb: 128, score: 80 },
  { min_storage_gb: 64, score: 55 },
  { min_storage_gb: 32, score: 42 },
  { min_storage_gb: 0, score: 36 },
];

export const RAM_SCORE_BY_GB: Array<{ min_ram_gb: number; score: number }> = [
  { min_ram_gb: 16, score: 92 },
  { min_ram_gb: 12, score: 88 },
  { min_ram_gb: 8, score: 79 },
  { min_ram_gb: 6, score: 68 },
  { min_ram_gb: 4, score: 52 },
  { min_ram_gb: 0, score: 38 },
];

export const APPLE_RAM_EQUIVALENT_MULTIPLIER = 1.42;
export const APPLE_RAM_MIN_EFFECTIVE_GB = 6;

export const AGE_DECAY_PER_YEAR = 7.1;
export const AGE_FLOOR_SCORE = 19;
export const AGE_FRESH_DEVICE_BONUS = 6;

export const FIVE_G_BONUS_SCORE = 5;
export const ESIM_BONUS_SCORE = 3;
export const BOX_AND_ACCESSORIES_BONUS_SCORE = 4;
export const BATTERY_HEALTH_PENALTY_PER_PERCENT_BELOW_90 = 0.55;

export const OPTIMAL_PRICE_TO_MEDIAN_RATIO = 0.93;
export const PRICE_SENSITIVITY_FACTOR = 130;
export const PRICE_SCORE_FLOOR = 20;
export const NEW_TO_USED_PRICE_SCORE_FLOOR = 15;
export const NEW_TO_USED_PRICE_TOLERANCE_RATIO = 0.09;
export const NEW_TO_USED_PRICE_OVERPRICING_PENALTY_MULTIPLIER = 1.25;
export const BEST_PRICE_MIN_RATIO = 0.78;
export const BEST_PRICE_MAX_RATIO = 1.14;
export const BEST_PRICE_STEP_PLN = 25;

export const DEMAND_TO_SUPPLY_GOOD_RATIO = 0.52;
export const DEMAND_TO_SUPPLY_STRONG_RATIO = 0.9;

export const LIQUIDITY_WEIGHTS = {
  brand_series_score: 0.26,
  age_score: 0.22,
  condition_score: 0.18,
  hardware_score: 0.1,
  price_score: 0.1,
  used_to_new_price_score: 0.12,
  market_depth_score: 0.08,
  geek_score: 0.02,
} as const;

export const ANNUAL_DEPRECIATION_BY_BRAND: Record<string, number> = {
  apple: 0.27,
  samsung: 0.33,
  google: 0.35,
  oneplus: 0.34,
  xiaomi: 0.38,
  redmi: 0.4,
  poco: 0.4,
  motorola: 0.39,
  realme: 0.41,
  oppo: 0.4,
  honor: 0.39,
  huawei: 0.42,
  nokia: 0.45,
};

export const DEFAULT_ANNUAL_DEPRECIATION = 0.39;
export const MIN_USED_TO_NEW_RATIO_BY_AGE: Array<{ min_age: number; ratio_floor: number }> = [
  { min_age: 5, ratio_floor: 0.14 },
  { min_age: 4, ratio_floor: 0.17 },
  { min_age: 3, ratio_floor: 0.22 },
  { min_age: 2, ratio_floor: 0.31 },
  { min_age: 1, ratio_floor: 0.43 },
  { min_age: 0, ratio_floor: 0.55 },
];

export const POLAND_2026_BUYING_POWER = {
  average_gross_salary_pln: 8900,
  estimated_median_net_salary_pln: 5700,
  strong_mass_market_price_share_of_net_salary: 0.35,
} as const;

export const OLX_2026_MARKET_SNAPSHOT_BY_BRAND: Record<
  string,
  { monthly_sales_count: number; active_listings_count: number; avg_days_to_sell: number }
> = {
  apple: { monthly_sales_count: 5200, active_listings_count: 7100, avg_days_to_sell: 8 },
  samsung: { monthly_sales_count: 4800, active_listings_count: 7600, avg_days_to_sell: 10 },
  xiaomi: { monthly_sales_count: 3200, active_listings_count: 6900, avg_days_to_sell: 13 },
  motorola: { monthly_sales_count: 1300, active_listings_count: 2800, avg_days_to_sell: 15 },
  google: { monthly_sales_count: 950, active_listings_count: 1800, avg_days_to_sell: 14 },
};

export const GEEK_MODEL_SCORE_HINTS: Array<{ keyword: string; geek_score: number }> = [
  { keyword: "iphone 15 pro", geek_score: 94 },
  { keyword: "iphone 15", geek_score: 90 },
  { keyword: "iphone 14 pro", geek_score: 89 },
  { keyword: "galaxy s24 ultra", geek_score: 95 },
  { keyword: "galaxy s24", geek_score: 91 },
  { keyword: "galaxy s23", geek_score: 86 },
  { keyword: "pixel 9 pro", geek_score: 92 },
  { keyword: "pixel 8", geek_score: 85 },
  { keyword: "xiaomi 14", geek_score: 88 },
  { keyword: "xiaomi 13", geek_score: 83 },
  { keyword: "redmi note", geek_score: 72 },
  { keyword: "moto g", geek_score: 65 },
];
