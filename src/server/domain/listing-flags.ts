/** Повреждения/состояния, при которых объявление «под сомнением» (блокировки, заливы). */
export const SUSPICIOUS_DAMAGE_TYPES = new Set(["locked", "water_damage"]);

export function isSuspiciousListing(damage_types: string[]): boolean {
  return damage_types.some((damage_type) => SUSPICIOUS_DAMAGE_TYPES.has(damage_type));
}

/** Не участвуют в медиане «исправных» — портят якорь цены модели. */
export const MEDIAN_EXCLUDED_DAMAGE_TYPES = new Set([
  "locked",
  "water_damage",
  "software",
]);

export function shouldExcludeFromPriceMedian(damage_types: string[]): boolean {
  return damage_types.some((damage_type) => MEDIAN_EXCLUDED_DAMAGE_TYPES.has(damage_type));
}
