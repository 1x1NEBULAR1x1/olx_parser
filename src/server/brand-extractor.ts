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

// Рыночные цены на исправные телефоны по бренду (PLN, медиана 2026)
const BRAND_WORKING_PRICE_MEDIAN: Record<string, number> = {
  apple: 2800,
  samsung: 1900,
  google: 1800,
  xiaomi: 900,
  redmi: 650,
  poco: 700,
  motorola: 800,
  huawei: 750,
  honor: 700,
  oppo: 750,
  realme: 600,
  oneplus: 1100,
  sony: 1200,
  nokia: 500,
  unknown: 700,
};

// Раньше эти же множители применялись ВНЕ ЗАВИСИМОСТИ от того, повреждено ли
// объявление — для целого iPhone за 3000 zł это давало estimated_working =
// max(2800, 3000/0.38) = 7894, market_sell_price = 6475 zł (в 2 раза выше
// цены покупки уже исправного телефона). Именованные константы ниже
// используются ТОЛЬКО в ветке is_damaged=true (см. estimateMarketSellPrice).
const DAMAGED_TO_WORKING_PRICE_RECOVERY_FACTOR = 0.38; // битый ≈ 38% рабочего
const REFURBISHED_RESALE_SHARE_OF_WORKING_PRICE = 0.82; // восстановленный продаётся за 82% рабочей цены

// Для НЕПОВРЕЖДЁННЫХ объявлений buy_price уже близка к рыночной (продавец не
// демпингует из-за дефекта) — небольшая наценка (человек, готовый подождать
// покупателя, обычно может продать чуть дороже конкретного объявления) плюс
// санити-клэмп относительно медианы бренда, чтобы ошибка распознавания
// бренда/цены не улетала в крайности.
const UNDAMAGED_RESALE_OPTIMISM_FACTOR = 1.06;
const SANITY_CLAMP_MIN_RATIO_TO_BRAND_MEDIAN = 0.45;
const SANITY_CLAMP_MAX_RATIO_TO_BRAND_MEDIAN = 1.9;

export function estimateMarketSellPrice(
  brand: string,
  model_key: string,
  buy_price: number | null,
  is_damaged: boolean,
  storage_gb: number | null = null,
): number | null {
  if (!buy_price || buy_price <= 0) return null;

  const model_working_price = getModelMarketPrice(model_key, storage_gb);
  const brand_median = BRAND_WORKING_PRICE_MEDIAN[brand] ?? 700;
  const working_price = model_working_price ?? brand_median;

  if (!is_damaged) {
    const optimistic_price = buy_price * UNDAMAGED_RESALE_OPTIMISM_FACTOR;
    const clamped = Math.min(
      Math.max(optimistic_price, working_price * SANITY_CLAMP_MIN_RATIO_TO_BRAND_MEDIAN),
      working_price * SANITY_CLAMP_MAX_RATIO_TO_BRAND_MEDIAN,
    );
    return Math.round(clamped);
  }

  const from_recovery = buy_price / DAMAGED_TO_WORKING_PRICE_RECOVERY_FACTOR;
  const estimated_working = Math.min(
    Math.max(working_price * 0.85, from_recovery),
    working_price * 1.1,
  );
  return Math.round(estimated_working * REFURBISHED_RESALE_SHARE_OF_WORKING_PRICE);
}
