// Общие утилиты для источников цен на запчасти (OLX, Ceneo) — вынесены из
// ceneo-fetcher.ts, чтобы не дублировать одну и ту же логику фильтрации
// в olx-parts-fetcher.ts.

// Допустимые диапазоны цен по типу запчасти (PLN) — отсекаем аномалии
// (например, чехлы/защитные стёкла по 5 zł, попавшие в выдачу по ключевым
// словам, или явно нерелевантные товары за тысячи злотых).
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

export function isPriceRealistic(price: number, damage_type: string): boolean {
  const range = PART_PRICE_RANGE[damage_type] ?? FALLBACK_RANGE;
  return price >= range.min && price <= range.max;
}

export function isRelevantProduct(product_name: string, brand: string, model_snippet: string): boolean {
  const name_lower = product_name.toLowerCase();
  const brand_lower = brand.toLowerCase();
  const model_lower = model_snippet.toLowerCase();

  // Должно упоминать хотя бы бренд или ключевое слово из модели
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
