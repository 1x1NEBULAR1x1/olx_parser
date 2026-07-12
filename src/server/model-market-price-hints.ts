import { containsKeyword } from "./text-match";

// Ориентировочные цены ИСПРАВНЫХ устройств (PLN, 2026). База — MARKET_REFERENCE_STORAGE_GB.
// Сырые значения ближе к «витринным» медианам; getModelMarketPrice() дополнительно
// умножает на OLX_USED_MARKET_FACTOR — реальные сделки на OLX.pl ниже на ~25–30%.
export const MARKET_REFERENCE_STORAGE_GB = 128;

/** Доля от справочной цены — типичная цена б/у на OLX.pl (износ, торг, не идеал). */
const OLX_USED_MARKET_FACTOR = 0.72;

const MODEL_MARKET_PRICE_HINTS: Array<{ keyword: string; price_pln: number }> = [
  { keyword: "iphone 17", price_pln: 4200 },
  { keyword: "iphone 16 pro max", price_pln: 4200 },
  { keyword: "iphone 16 pro", price_pln: 3600 },
  { keyword: "iphone 16 plus", price_pln: 3200 },
  { keyword: "iphone 16", price_pln: 2900 },
  { keyword: "iphone 15 pro max", price_pln: 3400 },
  { keyword: "iphone 15 pro", price_pln: 2900 },
  { keyword: "iphone 15 plus", price_pln: 2600 },
  { keyword: "iphone 15", price_pln: 2300 },
  { keyword: "iphone 14 pro max", price_pln: 2800 },
  { keyword: "iphone 14 pro", price_pln: 2400 },
  { keyword: "iphone 14 plus", price_pln: 2100 },
  { keyword: "iphone 14", price_pln: 1900 },
  { keyword: "iphone 13 pro max", price_pln: 2200 },
  { keyword: "iphone 13 pro", price_pln: 1800 },
  { keyword: "iphone 13 mini", price_pln: 1400 },
  { keyword: "iphone 13", price_pln: 1600 },
  { keyword: "iphone 12 pro max", price_pln: 1700 },
  { keyword: "iphone 12 pro", price_pln: 1400 },
  { keyword: "iphone 12 mini", price_pln: 1100 },
  { keyword: "iphone 12", price_pln: 1200 },
  { keyword: "iphone 11 pro max", price_pln: 1300 },
  { keyword: "iphone 11 pro", price_pln: 1050 },
  { keyword: "iphone 11", price_pln: 750 },
  { keyword: "iphone se", price_pln: 700 },
  { keyword: "iphone xs max", price_pln: 850 },
  { keyword: "iphone xs", price_pln: 700 },
  { keyword: "iphone xr", price_pln: 650 },
  { keyword: "iphone x", price_pln: 600 },
  { keyword: "iphone 8 plus", price_pln: 500 },
  { keyword: "iphone 8", price_pln: 420 },

  { keyword: "galaxy s25 ultra", price_pln: 3800 },
  { keyword: "galaxy s25", price_pln: 3000 },
  { keyword: "galaxy s24 ultra", price_pln: 2800 },
  { keyword: "galaxy s24", price_pln: 2100 },
  { keyword: "galaxy s23 ultra", price_pln: 2200 },
  { keyword: "galaxy s23", price_pln: 1600 },
  { keyword: "galaxy s22 ultra", price_pln: 1700 },
  { keyword: "galaxy s22", price_pln: 1200 },
  { keyword: "galaxy s21 ultra", price_pln: 1400 },
  { keyword: "galaxy s21", price_pln: 1000 },
  { keyword: "galaxy s20", price_pln: 750 },
  { keyword: "galaxy note 20", price_pln: 1100 },
  { keyword: "galaxy note 10", price_pln: 800 },
  { keyword: "galaxy z fold 6", price_pln: 4200 },
  { keyword: "galaxy z fold 5", price_pln: 3200 },
  { keyword: "galaxy z flip 6", price_pln: 2600 },
  { keyword: "galaxy z flip 5", price_pln: 2000 },
  { keyword: "galaxy a55", price_pln: 750 },
  { keyword: "galaxy a54", price_pln: 650 },
  { keyword: "galaxy a53", price_pln: 550 },
  { keyword: "galaxy a52", price_pln: 480 },
  { keyword: "galaxy a35", price_pln: 600 },
  { keyword: "galaxy a34", price_pln: 500 },
  { keyword: "galaxy a25", price_pln: 450 },
  { keyword: "galaxy a15", price_pln: 380 },

  { keyword: "pixel 9 pro", price_pln: 2800 },
  { keyword: "pixel 9", price_pln: 2200 },
  { keyword: "pixel 8 pro", price_pln: 2000 },
  { keyword: "pixel 8", price_pln: 1500 },
  { keyword: "pixel 7 pro", price_pln: 1400 },
  { keyword: "pixel 7", price_pln: 1100 },
  { keyword: "pixel 6 pro", price_pln: 1000 },
  { keyword: "pixel 6", price_pln: 800 },

  { keyword: "redmi note 13 pro", price_pln: 650 },
  { keyword: "redmi note 13", price_pln: 520 },
  { keyword: "redmi note 12 pro", price_pln: 550 },
  { keyword: "redmi note 12", price_pln: 450 },
  { keyword: "redmi note 11", price_pln: 380 },
  { keyword: "poco x6 pro", price_pln: 750 },
  { keyword: "poco x6", price_pln: 600 },
  { keyword: "poco f6", price_pln: 1100 },
  { keyword: "poco f5", price_pln: 850 },
  { keyword: "mi 14 ultra", price_pln: 2200 },
  { keyword: "mi 14", price_pln: 1500 },
  { keyword: "mi 13", price_pln: 1100 },

  { keyword: "oneplus 12", price_pln: 1800 },
  { keyword: "oneplus 11", price_pln: 1300 },
  { keyword: "oneplus 10", price_pln: 950 },
  { keyword: "motorola edge 50", price_pln: 900 },
  { keyword: "motorola edge 40", price_pln: 700 },
];

const STORAGE_PRICE_MULTIPLIER: Record<number, number> = {
  32: 0.88,
  64: 1,
  128: 1.14,
  256: 1.28,
  512: 1.42,
  1024: 1.58,
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
  if (storage_gb <= 32) return 0.88;
  if (storage_gb <= 64) return 1;
  if (storage_gb <= 128) return 1.14;
  if (storage_gb <= 256) return 1.28;
  if (storage_gb <= 512) return 1.42;
  return 1.58;
}

/**
 * Ориентировочная рыночная цена исправного устройства по model_key.
 * null — модель не в справочнике (откат на кэш/бренд).
 */
export function getModelMarketPrice(model_key: string, storage_gb: number | null = null): number | null {
  const normalized_key = model_key.toLowerCase().trim();
  if (!normalized_key) return null;

  let best_match: { keyword: string; price_pln: number } | null = null;
  for (const hint of MODEL_MARKET_PRICE_HINTS) {
    if (!containsKeyword(normalized_key, hint.keyword)) continue;
    if (!best_match || hint.keyword.length > best_match.keyword.length) {
      best_match = hint;
    }
  }

  if (!best_match) return null;

  const effective_storage = storage_gb ?? MARKET_REFERENCE_STORAGE_GB;
  const storage_adjusted = best_match.price_pln
    * getStorageMultiplier(effective_storage)
    / getStorageMultiplier(MARKET_REFERENCE_STORAGE_GB);

  return Math.round(storage_adjusted * OLX_USED_MARKET_FACTOR);
}
