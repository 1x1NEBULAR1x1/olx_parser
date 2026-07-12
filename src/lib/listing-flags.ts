/** Повреждения, при которых объявление «под сомнением» (блокировки, заливы). */
export const SUSPICIOUS_DAMAGE_TYPES = new Set(["locked", "water_damage"]);

export function isSuspiciousListing(damage_types: string[]): boolean {
  return damage_types.some((damage_type) => SUSPICIOUS_DAMAGE_TYPES.has(damage_type));
}
