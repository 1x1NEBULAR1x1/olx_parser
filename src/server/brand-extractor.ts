import { containsKeyword } from "./text-match";
import { getModelMarketPrice } from "./model-market-price-hints";

const KNOWN_BRANDS: Record<string, string[]> = {
  apple: ["apple", "iphone", "ipad"],
  samsung: ["samsung", "galaxy"],
  xiaomi: ["xiaomi", "mi ", "mi12", "mi13", "mi14", "mi11", "mi10", "mi9"],
  redmi: ["redmi"],
  poco: ["poco"],
  google: ["google", "pixel"],
  motorola: ["motorola", "moto "],
  huawei: ["huawei"],
  honor: ["honor"],
  oppo: ["oppo"],
  realme: ["realme"],
  oneplus: ["oneplus", "one plus"],
  sony: ["sony", "xperia"],
  nokia: ["nokia"],
  vivo: ["vivo"],
  infinix: ["infinix"],
  tecno: ["tecno"],
  asus: ["asus", "zenfone"],
  lg: ["lg "],
  htc: ["htc"],
};

export function extractBrand(title: string): string {
  const normalized = title.toLowerCase();
  for (const [brand, keywords] of Object.entries(KNOWN_BRANDS)) {
    // containsKeyword матчит по границе слова: раньше здесь был обычный
    // includes(), из-за чего ключевое слово xiaomi "mi " ложно матчилось
    // внутри "redmi " ("Redmi Note 12" определялся как бренд "xiaomi").
    if (keywords.some((kw) => containsKeyword(normalized, kw))) {
      return brand;
    }
  }
  return "unknown";
}

export function extractBrandDisplay(brand: string): string {
  const display_map: Record<string, string> = {
    apple: "Apple",
    samsung: "Samsung",
    xiaomi: "Xiaomi",
    redmi: "Redmi",
    poco: "POCO",
    google: "Google",
    motorola: "Motorola",
    huawei: "Huawei",
    honor: "Honor",
    oppo: "OPPO",
    realme: "Realme",
    oneplus: "OnePlus",
    sony: "Sony",
    nokia: "Nokia",
    vivo: "Vivo",
    infinix: "Infinix",
    tecno: "Tecno",
    asus: "ASUS",
    lg: "LG",
    htc: "HTC",
    unknown: "Другой",
  };
  return display_map[brand] ?? brand;
}

// Рыночные цены на исправные телефоны по бренду (PLN, медиана OLX б/у 2026)
const BRAND_WORKING_PRICE_MEDIAN: Record<string, number> = {
  apple: 2100,
  samsung: 1500,
  google: 1400,
  xiaomi: 750,
  redmi: 520,
  poco: 580,
  motorola: 650,
  huawei: 620,
  honor: 580,
  oppo: 620,
  realme: 500,
  oneplus: 900,
  sony: 1000,
  nokia: 420,
  unknown: 600,
};

const UNDAMAGED_RESALE_OPTIMISM_FACTOR = 1.04;
const SANITY_CLAMP_MIN_RATIO_TO_WORKING = 0.5;
const SANITY_CLAMP_MAX_RATIO_TO_WORKING = 1.08;

/** Скидка от цены исправного б/у после ремонта (доля, не абсолют). */
const POST_REPAIR_DISCOUNT_BY_DAMAGE: Record<string, number> = {
  screen: 0.10,
  battery: 0.06,
  back_cover: 0.05,
  charging_port: 0.07,
  buttons: 0.04,
  camera: 0.12,
  speaker: 0.06,
  microphone: 0.06,
  body: 0.14,
  frame: 0.14,
  software: 0.10,
  sim_slot: 0.05,
  water_damage: 0.22,
  locked: 0.28,
  unknown: 0.12,
};

const DEFAULT_POST_REPAIR_DISCOUNT = 0.08;
const MAX_POST_REPAIR_DISCOUNT = 0.38;
const REFURBISHED_MAX_SHARE_OF_WORKING = 0.92;

function computePostRepairDiscount(damage_types: string[]): number {
  if (damage_types.length === 0) return DEFAULT_POST_REPAIR_DISCOUNT;

  let total = 0;
  for (const damage_type of damage_types) {
    total += POST_REPAIR_DISCOUNT_BY_DAMAGE[damage_type] ?? 0.10;
  }

  return Math.min(MAX_POST_REPAIR_DISCOUNT, total * 0.82);
}

/**
 * Оценка цены продажи ПОСЛЕ ремонта: отталкиваемся от рыночной цены исправного
 * б/у на OLX, а не от обратного восстановления buy_price / 0.38.
 */
export function estimateDamagedResalePrice(
  working_price: number,
  damage_types: string[],
  buy_price: number | null,
  parts_cost_estimate: number | null = null,
): number {
  const discount = computePostRepairDiscount(damage_types);
  let sell = working_price * (1 - discount);
  sell = Math.min(sell, working_price * REFURBISHED_MAX_SHARE_OF_WORKING);

  if (parts_cost_estimate !== null && parts_cost_estimate > 0 && buy_price && buy_price > 0) {
    const repair_floor = buy_price + parts_cost_estimate * 1.12 + 80;
    sell = Math.max(sell, repair_floor);
    sell = Math.min(sell, working_price * 0.95);
  }

  return Math.round(sell);
}

export function estimateMarketSellPrice(
  brand: string,
  model_key: string,
  buy_price: number | null,
  is_damaged: boolean,
  storage_gb: number | null = null,
  damage_types: string[] = [],
  parts_cost_estimate: number | null = null,
): number | null {
  if (!buy_price || buy_price <= 0) return null;

  const model_working_price = getModelMarketPrice(model_key, storage_gb);
  const brand_median = BRAND_WORKING_PRICE_MEDIAN[brand] ?? 600;
  const working_price = model_working_price ?? brand_median;

  if (!is_damaged) {
    const optimistic_price = buy_price * UNDAMAGED_RESALE_OPTIMISM_FACTOR;
    const clamped = Math.min(
      Math.max(optimistic_price, working_price * SANITY_CLAMP_MIN_RATIO_TO_WORKING),
      working_price * SANITY_CLAMP_MAX_RATIO_TO_WORKING,
    );
    return Math.round(clamped);
  }

  return estimateDamagedResalePrice(
    working_price,
    damage_types,
    buy_price,
    parts_cost_estimate,
  );
}
