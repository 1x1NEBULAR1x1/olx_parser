import { extractBrand } from "@/server/domain/brand-extractor";
import { extractModelKey } from "@/server/domain/model-normalizer";
import { extractStorageGb, getModelMarketPrice } from "@/server/domain/model-market-price-hints";
import { getStaticPartsEstimate } from "@/server/domain/static-parts-prices";

export interface ListingPrefilterInput {
  id: number;
  title: string;
  price_buy: number | null;
}

export interface ListingCandidate {
  id: number;
  title: string;
  price_buy: number | null;
  brand: string;
  model_key: string;
  storage_gb: number | null;
  guessed_damage_types: string[];
  estimated_sell_price: number | null;
  estimated_parts_cost: number | null;
  estimated_profit: number | null;
  priority_score: number;
}

export interface TwoPhaseSelection {
  full_ids: number[];
  lightweight_ids: number[];
}

export interface TwoPhaseOptions {
  enabled: boolean;
  full_analyze_limit: number;
  min_profit_pln: number;
}

const TITLE_DAMAGE_KEYWORDS: Array<[string, string[]]> = [
  ["screen", ["ekran", "wyświetlacz", "wyswietlacz", "pęknięty", "pekniety", "cracked", "zbity"]],
  ["battery", ["bateria", "akumulator"]],
  ["back_cover", ["plecki", "tylna szyba", "tylna obudowa"]],
  ["water_damage", ["zalany", "zalanie", "woda"]],
  ["locked", ["icloud", "frp", "zablokowany", "konto google"]],
  ["charging_port", ["gniazdo", "ładowania", "usb"]],
  ["camera", ["aparat", "kamera"]],
];

const HEALTH_MARKERS = ["nowa", "nowy", "sprawny", "100%", "bez zarzutu"];

function includesToken(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

export function guessDamageTypesFromTitle(title: string): string[] {
  const normalized = title.toLowerCase();
  const detected: string[] = [];

  for (const [damage_type, keywords] of TITLE_DAMAGE_KEYWORDS) {
    const matched = keywords.some((keyword) => includesToken(normalized, keyword));
    if (!matched) continue;
    const looks_healthy = HEALTH_MARKERS.some((marker) => includesToken(normalized, marker))
      && (damage_type === "battery" || damage_type === "screen");
    if (damage_type === "battery" && /\bbateria[^%]{0,20}\d{2,3}\s*%/i.test(title) && !normalized.includes("uszkod")) {
      continue;
    }
    if (looks_healthy && !normalized.includes("uszkod") && !normalized.includes("pęk") && !normalized.includes("pek")) {
      continue;
    }
    detected.push(damage_type);
  }

  return detected;
}

function estimatePartsCostFromTitle(brand: string, title: string, damage_types: string[]): number | null {
  if (damage_types.length === 0) return 0;
  const estimates = getStaticPartsEstimate(brand, title, damage_types);
  if (estimates.length === 0) return null;
  return estimates.reduce((sum, item) => sum + item.price_estimate, 0);
}

export function scoreListingCandidate(input: ListingPrefilterInput): ListingCandidate {
  const brand = extractBrand(input.title);
  const { model_key } = extractModelKey(brand, input.title);
  const storage_gb = extractStorageGb(input.title);
  const guessed_damage_types = guessDamageTypesFromTitle(input.title);
  const estimated_sell_price = getModelMarketPrice(model_key, storage_gb);
  const estimated_parts_cost = estimatePartsCostFromTitle(brand, input.title, guessed_damage_types);

  let estimated_profit: number | null = null;
  if (input.price_buy !== null && estimated_sell_price !== null) {
    estimated_profit = Math.round(estimated_sell_price - input.price_buy - (estimated_parts_cost ?? 0));
  }

  let priority_score = estimated_profit ?? -500;
  if (guessed_damage_types.length > 0 && (estimated_profit ?? 0) > 0) {
    priority_score += 40;
  }
  if (guessed_damage_types.includes("water_damage") || guessed_damage_types.includes("locked")) {
    priority_score -= 120;
  }
  if (brand === "unknown") {
    priority_score -= 80;
  }

  return {
    id: input.id,
    title: input.title,
    price_buy: input.price_buy,
    brand,
    model_key,
    storage_gb,
    guessed_damage_types,
    estimated_sell_price,
    estimated_parts_cost,
    estimated_profit,
    priority_score,
  };
}

export function selectListingsForFullAnalysis(
  candidates: ListingCandidate[],
  options: TwoPhaseOptions,
): TwoPhaseSelection {
  if (!options.enabled || candidates.length <= options.full_analyze_limit) {
    return {
      full_ids: candidates.map((candidate) => candidate.id),
      lightweight_ids: [],
    };
  }

  const ranked = [...candidates].sort((a, b) => b.priority_score - a.priority_score);
  const profitable = ranked.filter(
    (candidate) => (candidate.estimated_profit ?? Number.NEGATIVE_INFINITY) >= options.min_profit_pln,
  );
  const remainder = ranked.filter(
    (candidate) => (candidate.estimated_profit ?? Number.NEGATIVE_INFINITY) < options.min_profit_pln,
  );
  const selected = [...profitable, ...remainder].slice(0, options.full_analyze_limit);
  const taken = new Set(selected.map((candidate) => candidate.id));

  return {
    full_ids: selected.map((candidate) => candidate.id),
    lightweight_ids: candidates
      .map((candidate) => candidate.id)
      .filter((id) => !taken.has(id)),
  };
}
