// Общие утилиты для источников цен на запчасти (OLX, Ceneo) — вынесены из
// ceneo-fetcher.ts, чтобы не дублировать одну и ту же логику фильтрации
// в olx-parts-fetcher.ts.

import { BASE_PART_PRICES } from "@/server/domain/static-parts-prices";

// Допустимые диапазоны цен по типу запчасти (PLN) — грубый предфильтр до
// медианного отсечения выбросов (чехлы за 5 zł, каталоги за тысячи).
export const PART_PRICE_RANGE: Record<string, { min: number; max: number }> = {
  screen: { min: 25, max: 2800 },
  battery: { min: 10, max: 400 },
  back_cover: { min: 8, max: 250 },
  buttons: { min: 4, max: 100 },
  charging_port: { min: 8, max: 150 },
  camera: { min: 20, max: 900 },
  speaker: { min: 8, max: 130 },
  microphone: { min: 4, max: 100 },
  body: { min: 10, max: 350 },
};

const FALLBACK_RANGE = { min: 5, max: 3000 };

/** Минимальная доля от медианы выдачи — ниже считаем мусором (экран за 27 zł). */
export const PART_MEDIAN_MIN_RATIO = 0.45;
/** Верхняя граница относительно медианы — отсекаем явные выбросы вверх. */
export const PART_MEDIAN_MAX_RATIO = 3;
/** Нижний порог от справочной цены запчасти, если медиана ненадёжна. */
export const PART_ANCHOR_MIN_RATIO = 0.35;

export function isPriceRealistic(price: number, damage_type: string): boolean {
  const range = PART_PRICE_RANGE[damage_type] ?? FALLBACK_RANGE;
  return price >= range.min && price <= range.max;
}

export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function getPartPriceFloor(damage_type: string, median: number | null): number {
  const anchor = BASE_PART_PRICES[damage_type];
  const median_floor = median !== null && median > 0 ? median * PART_MEDIAN_MIN_RATIO : 0;
  const anchor_floor = anchor !== undefined ? anchor * PART_ANCHOR_MIN_RATIO : 0;
  return Math.max(median_floor, anchor_floor);
}

function getPartPriceCeiling(damage_type: string, median: number | null): number {
  const range = PART_PRICE_RANGE[damage_type] ?? FALLBACK_RANGE;
  if (median === null || median <= 0) return range.max;
  return Math.min(range.max, median * PART_MEDIAN_MAX_RATIO);
}

/**
 * Медианный фильтр цен внутри одного типа повреждения: убирает слишком
 * дешёвые/дорогие выбросы относительно остальной выдачи поиска.
 */
export function filterPartsByMedianPrice<T extends { price: number }>(
  items: T[],
  damage_type: string,
): T[] {
  if (items.length === 0) return items;

  const prices = items.map((item) => item.price);
  const median = computeMedian(prices);
  const floor = getPartPriceFloor(damage_type, median);
  const ceiling = getPartPriceCeiling(damage_type, median);

  const filtered = items.filter((item) => item.price >= floor && item.price <= ceiling);
  if (filtered.length > 0) return filtered;

  const anchor = BASE_PART_PRICES[damage_type];
  if (anchor !== undefined) {
    const anchor_filtered = items.filter(
      (item) => item.price >= anchor * PART_ANCHOR_MIN_RATIO && item.price <= ceiling,
    );
    if (anchor_filtered.length > 0) return anchor_filtered;
  }

  return [];
}

export function isRelevantProduct(product_name: string, brand: string, model_snippet: string): boolean {
  const name_lower = product_name.toLowerCase();
  const brand_lower = brand.toLowerCase();
  const model_lower = model_snippet.toLowerCase();

  const brand_match = brand !== "unknown" && name_lower.includes(brand_lower);
  const model_words = model_lower.split(" ").filter((w) => w.length > 2);
  const model_match = model_words.some((w) => name_lower.includes(w));

  return brand_match || model_match;
}

/**
 * Проверяет, что заголовок объявления упоминает хотя бы одно слово из
 * названия запчасти (part_keyword, например "bateria"). Актуально для OLX —
 * в отличие от Ceneo/Allegro (чистый каталог запчастей), в категории OLX
 * "Części do telefonów" вперемешку попадаются объявления о продаже целого
 * "донорского" телефона на части — они проходят isRelevantProduct по
 * совпадению бренда/модели, но реально не являются искомой запчастью.
 */
export function mentionsPartKeyword(product_name: string, part_keyword: string): boolean {
  const name_lower = product_name.toLowerCase();
  const keyword_words = part_keyword.toLowerCase().split(" ").filter((w) => w.length > 2);
  if (keyword_words.length === 0) return true;
  return keyword_words.some((w) => name_lower.includes(w));
}

export function parsePlnPrice(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").replace(/zł/gi, "").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}
