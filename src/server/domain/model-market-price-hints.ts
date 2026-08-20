import { containsKeyword } from "./text-match";

// Ориентиры цен ИСПРАВНЫХ б/у устройств на OLX.pl (PLN, август 2026).
// База — MARKET_REFERENCE_STORAGE_GB. Это уже типичная цена сделки, а не
// витрина магазина: getModelMarketPrice() только масштабирует объём памяти.
// Ручные правки в админ-каталоге ДОПОЛНЯЮТ эти цифры, а не заменяют формулу 0.72.
export const MARKET_REFERENCE_STORAGE_GB = 128;

const MODEL_MARKET_PRICE_HINTS: Array<{ keyword: string; price_pln: number }> = [
  { keyword: "iphone 17 pro max", price_pln: 5600 },
  { keyword: "iphone 17 pro", price_pln: 4800 },
  { keyword: "iphone 17 plus", price_pln: 4000 },
  { keyword: "iphone 17", price_pln: 3600 },
  { keyword: "iphone 16 pro max", price_pln: 4300 },
  { keyword: "iphone 16 pro", price_pln: 3800 },
  { keyword: "iphone 16 plus", price_pln: 3300 },
  { keyword: "iphone 16", price_pln: 3000 },
  { keyword: "iphone 15 pro max", price_pln: 3500 },
  { keyword: "iphone 15 pro", price_pln: 3000 },
  { keyword: "iphone 15 plus", price_pln: 2500 },
  { keyword: "iphone 15", price_pln: 2200 },
  { keyword: "iphone 14 pro max", price_pln: 2700 },
  { keyword: "iphone 14 pro", price_pln: 2300 },
  { keyword: "iphone 14 plus", price_pln: 2000 },
  { keyword: "iphone 14", price_pln: 1750 },
  { keyword: "iphone 13 pro max", price_pln: 2100 },
  { keyword: "iphone 13 pro", price_pln: 1750 },
  { keyword: "iphone 13 mini", price_pln: 1300 },
  { keyword: "iphone 13", price_pln: 1500 },
  { keyword: "iphone 12 pro max", price_pln: 1550 },
  { keyword: "iphone 12 pro", price_pln: 1300 },
  { keyword: "iphone 12 mini", price_pln: 950 },
  { keyword: "iphone 12", price_pln: 1100 },
  { keyword: "iphone 11 pro max", price_pln: 1100 },
  { keyword: "iphone 11 pro", price_pln: 900 },
  { keyword: "iphone 11", price_pln: 700 },
  { keyword: "iphone se", price_pln: 650 },
  { keyword: "iphone xs max", price_pln: 800 },
  { keyword: "iphone xs", price_pln: 650 },
  { keyword: "iphone xr", price_pln: 600 },
  { keyword: "iphone x", price_pln: 550 },
  { keyword: "iphone 8 plus", price_pln: 450 },
  { keyword: "iphone 8", price_pln: 380 },

  { keyword: "galaxy s25 ultra", price_pln: 3400 },
  { keyword: "galaxy s25 fe", price_pln: 1900 },
  { keyword: "galaxy s25", price_pln: 2700 },
  { keyword: "galaxy s24 ultra", price_pln: 2600 },
  { keyword: "galaxy s24 fe", price_pln: 1600 },
  { keyword: "galaxy s24", price_pln: 1900 },
  { keyword: "galaxy s23 ultra", price_pln: 2000 },
  { keyword: "galaxy s23 fe", price_pln: 1200 },
  { keyword: "galaxy s23", price_pln: 1450 },
  { keyword: "galaxy s22 ultra", price_pln: 1550 },
  { keyword: "galaxy s22", price_pln: 1100 },
  { keyword: "galaxy s21 ultra", price_pln: 1250 },
  { keyword: "galaxy s21 fe", price_pln: 750 },
  { keyword: "galaxy s21", price_pln: 900 },
  { keyword: "galaxy s20 fe", price_pln: 650 },
  { keyword: "s20fe", price_pln: 650 },
  { keyword: "galaxy s20", price_pln: 700 },
  { keyword: "galaxy s10", price_pln: 480 },
  { keyword: "galaxy s9", price_pln: 350 },
  { keyword: "galaxy s8", price_pln: 280 },
  { keyword: "galaxy s7", price_pln: 220 },
  { keyword: "galaxy note 20 ultra", price_pln: 1100 },
  { keyword: "note20 ultra", price_pln: 1100 },
  { keyword: "galaxy note 20", price_pln: 1000 },
  { keyword: "galaxy note 10", price_pln: 750 },
  { keyword: "galaxy z fold 7", price_pln: 4200 },
  { keyword: "z fold 7", price_pln: 4200 },
  { keyword: "galaxy z fold 6", price_pln: 3800 },
  { keyword: "galaxy z fold 5", price_pln: 2900 },
  { keyword: "galaxy z fold4", price_pln: 2200 },
  { keyword: "z fold4", price_pln: 2200 },
  { keyword: "galaxy z fold 4", price_pln: 2200 },
  { keyword: "galaxy z flip 6", price_pln: 2300 },
  { keyword: "galaxy z flip 5", price_pln: 1800 },
  { keyword: "galaxy a56", price_pln: 850 },
  { keyword: "galaxy a55", price_pln: 700 },
  { keyword: "galaxy a54", price_pln: 600 },
  { keyword: "galaxy a53", price_pln: 500 },
  { keyword: "galaxy a52", price_pln: 430 },
  { keyword: "galaxy a50", price_pln: 280 },
  { keyword: "galaxy a36", price_pln: 650 },
  { keyword: "galaxy a35", price_pln: 550 },
  { keyword: "galaxy a34", price_pln: 450 },
  { keyword: "galaxy a26", price_pln: 480 },
  { keyword: "galaxy a25", price_pln: 400 },
  { keyword: "galaxy a16", price_pln: 380 },
  { keyword: "galaxy a15", price_pln: 340 },
  { keyword: "galaxy a14", price_pln: 300 },
  { keyword: "galaxy a13", price_pln: 260 },
  { keyword: "galaxy a40", price_pln: 240 },
  { keyword: "galaxy m52", price_pln: 420 },
  { keyword: "galaxy m13", price_pln: 280 },
  { keyword: "iphone 7", price_pln: 280 },
  { keyword: "iphone 6s", price_pln: 200 },
  { keyword: "iphone 6", price_pln: 160 },
  { keyword: "iphone 5", price_pln: 120 },
  { keyword: "iphone air", price_pln: 3600 },

  { keyword: "pixel 10 pro", price_pln: 3200 },
  { keyword: "pixel 10", price_pln: 2600 },
  { keyword: "pixel 9 pro", price_pln: 2500 },
  { keyword: "pixel 9", price_pln: 2000 },
  { keyword: "pixel 8 pro", price_pln: 1800 },
  { keyword: "pixel 8", price_pln: 1350 },
  { keyword: "pixel 7 pro", price_pln: 1250 },
  { keyword: "pixel 7", price_pln: 1000 },
  { keyword: "pixel 6 pro", price_pln: 900 },
  { keyword: "pixel 6", price_pln: 720 },

  { keyword: "redmi note 14 pro", price_pln: 950 },
  { keyword: "redmi note 14", price_pln: 750 },
  { keyword: "redmi note 13 pro plus", price_pln: 1050 },
  { keyword: "redmi note 13 pro+", price_pln: 1050 },
  { keyword: "redmi note 13 pro 5g", price_pln: 950 },
  { keyword: "redmi note 13 pro", price_pln: 880 },
  { keyword: "redmi note 13", price_pln: 700 },
  { keyword: "redmi note 12 pro", price_pln: 620 },
  { keyword: "redmi note 12", price_pln: 500 },
  { keyword: "redmi note 11", price_pln: 400 },
  { keyword: "redmi 15c", price_pln: 480 },
  { keyword: "redmi 14c", price_pln: 420 },
  { keyword: "redmi 14", price_pln: 500 },
  { keyword: "redmi 13c", price_pln: 380 },
  { keyword: "redmi 13", price_pln: 550 },
  { keyword: "redmi 12", price_pln: 420 },
  { keyword: "poco x6 pro", price_pln: 800 },
  { keyword: "poco x6", price_pln: 650 },
  { keyword: "poco f6", price_pln: 1100 },
  { keyword: "poco f5", price_pln: 850 },
  { keyword: "xiaomi 15", price_pln: 2400 },
  { keyword: "xiaomi 14 ultra", price_pln: 2800 },
  { keyword: "xiaomi 14", price_pln: 1900 },
  { keyword: "xiaomi 13 ultra", price_pln: 1800 },
  { keyword: "xiaomi 13", price_pln: 1200 },
  { keyword: "xiaomi mi 15", price_pln: 2400 },
  { keyword: "xiaomi mi 14", price_pln: 1900 },
  { keyword: "xiaomi mi 13", price_pln: 1200 },
  { keyword: "xiaomi mi 11", price_pln: 700 },
  { keyword: "mi 15", price_pln: 2400 },
  { keyword: "mi 14 ultra", price_pln: 2800 },
  { keyword: "mi 14", price_pln: 1900 },
  { keyword: "mi 13 ultra", price_pln: 1800 },
  { keyword: "mi 13", price_pln: 1200 },
  { keyword: "mi 11", price_pln: 700 },

  { keyword: "oneplus 13", price_pln: 2100 },
  { keyword: "oneplus 12", price_pln: 1700 },
  { keyword: "oneplus 11", price_pln: 1250 },
  { keyword: "oneplus 10", price_pln: 900 },
  { keyword: "motorola edge 50 fusion", price_pln: 850 },
  { keyword: "motorola edge 50", price_pln: 900 },
  { keyword: "motorola edge 40", price_pln: 650 },
  { keyword: "motorola g13", price_pln: 280 },
  { keyword: "edge 50 fusion", price_pln: 850 },
  { keyword: "edge 50", price_pln: 900 },
  { keyword: "realme 14 pro", price_pln: 850 },
  { keyword: "realme 14", price_pln: 700 },
  { keyword: "realme 8i", price_pln: 320 },
  { keyword: "honor 60", price_pln: 450 },
  { keyword: "honor 20", price_pln: 280 },
  { keyword: "honor magic 6 pro", price_pln: 1600 },
  { keyword: "honor magic6 pro", price_pln: 1600 },
  { keyword: "huawei p30 pro", price_pln: 520 },
  { keyword: "huawei p30", price_pln: 380 },
  { keyword: "huawei p20 lite", price_pln: 240 },
  { keyword: "huawei p20", price_pln: 220 },
  { keyword: "huawei p smart", price_pln: 260 },
  { keyword: "asus zenfone 9", price_pln: 900 },
];

/** Стартовая цена б/у 128 GB, если модели нет в точечном справочнике. */
export const BRAND_STARTING_PRICE_PLN: Record<string, number> = {
  apple: 1600,
  samsung: 900,
  google: 1400,
  xiaomi: 750,
  redmi: 520,
  poco: 580,
  motorola: 650,
  huawei: 520,
  honor: 580,
  oppo: 620,
  realme: 500,
  oneplus: 900,
  sony: 1000,
  nokia: 280,
  vivo: 480,
  asus: 700,
  infinix: 380,
  lg: 220,
  htc: 180,
  unknown: 450,
};

const STORAGE_PRICE_MULTIPLIER: Record<number, number> = {
  32: 0.82,
  64: 0.9,
  128: 1,
  256: 1.12,
  512: 1.22,
  1024: 1.32,
};

/** Извлекает объём памяти (GB) из заголовка/описания объявления. */
export function extractStorageGb(text: string): number | null {
  const normalized = text.toLowerCase();
  const slash_match = normalized.match(/\b(\d{1,2})\s*\/\s*(\d{2,4})\s*gb\b/);
  if (slash_match?.[2]) {
    const storage = Number.parseInt(slash_match[2], 10);
    if (storage >= 16 && storage <= 2048) return storage;
  }
  const matches = [...normalized.matchAll(/\b(\d{2,4})\s*gb\b/g)];
  if (matches.length === 0) return null;
  const values = matches
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => value >= 16 && value <= 2048);
  if (values.length === 0) return null;
  return Math.max(...values);
}

export function getStorageMultiplier(storage_gb: number | null): number {
  if (storage_gb === null) return getStorageMultiplier(MARKET_REFERENCE_STORAGE_GB);
  if (STORAGE_PRICE_MULTIPLIER[storage_gb] !== undefined) {
    return STORAGE_PRICE_MULTIPLIER[storage_gb];
  }
  if (storage_gb <= 32) return 0.82;
  if (storage_gb <= 64) return 0.9;
  if (storage_gb <= 128) return 1;
  if (storage_gb <= 256) return 1.12;
  if (storage_gb <= 512) return 1.22;
  return 1.32;
}

export function adjustPriceForStorage(base_price_128gb: number, storage_gb: number | null): number {
  const multiplier = getStorageMultiplier(storage_gb)
    / getStorageMultiplier(MARKET_REFERENCE_STORAGE_GB);
  return Math.round(base_price_128gb * multiplier);
}

function isSafeModelKeywordMatch(model_key: string, keyword: string): boolean {
  const normalized_key = model_key.toLowerCase().trim();
  const normalized_keyword = keyword.toLowerCase().trim();
  if (!containsKeyword(normalized_key, normalized_keyword)) return false;
  // «mi 13» не должен цеплять «redmi 13»: lookbehind по букве уже режет
  // подстроку, но на всякий случай блокируем redmi-токен для голого mi.
  if (normalized_keyword === "mi 13" || normalized_keyword.startsWith("mi 1")) {
    if (/\bredmi\b/.test(normalized_key)) return false;
  }
  return true;
}

/**
 * Ориентировочная рыночная цена исправного б/у устройства по model_key.
 * null — модель не в справочнике (откат на кэш/бренд/каталог).
 */
export function getModelMarketPrice(model_key: string, storage_gb: number | null = null): number | null {
  const normalized_key = model_key.toLowerCase().trim();
  if (!normalized_key) return null;

  let best_match: { keyword: string; price_pln: number } | null = null;
  for (const hint of MODEL_MARKET_PRICE_HINTS) {
    if (!isSafeModelKeywordMatch(normalized_key, hint.keyword)) continue;
    if (!best_match || hint.keyword.length > best_match.keyword.length) {
      best_match = hint;
    }
  }

  if (!best_match) return null;

  return adjustPriceForStorage(best_match.price_pln, storage_gb ?? MARKET_REFERENCE_STORAGE_GB);
}

/**
 * Стартовая рыночная цена: точечный справочник, иначе медиана бренда.
 * Нужна, чтобы у каждой модели каталога сразу был ориентир — скан потом уточнит.
 */
export function resolveStartingMarketPrice(
  brand: string,
  model_key: string,
  storage_gb: number | null = null,
): number {
  const hinted = getModelMarketPrice(model_key, storage_gb);
  if (hinted !== null) return hinted;
  const base = BRAND_STARTING_PRICE_PLN[brand] ?? BRAND_STARTING_PRICE_PLN.unknown;
  return adjustPriceForStorage(base, storage_gb ?? MARKET_REFERENCE_STORAGE_GB);
}
