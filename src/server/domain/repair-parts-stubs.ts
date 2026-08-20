import type { AllegroPart } from "@/shared/types/domain";
import { resolveStartingMarketPrice } from "@/server/domain/model-market-price-hints";
import {
  BASE_PART_PRICES,
  BRAND_PRICE_MULTIPLIER,
  PART_NAMES,
  PART_SEARCH_KEYWORDS,
  buildAllegroSearchUrl,
} from "@/server/domain/static-parts-prices";
import { buildOlxPartsSearchUrl } from "@/server/fetchers/olx-parts-fetcher";

export const PART_ESTIMATE_MARKER = "★";

/** Доля от ориентировочной цены устройства → типичная цена запчасти (PLN). */
const MARKET_PRICE_PART_RATIOS: Record<string, number> = {
  screen: 0.24,
  battery: 0.11,
  back_cover: 0.08,
  charging_port: 0.055,
  camera: 0.14,
  buttons: 0.02,
  speaker: 0.025,
  microphone: 0.02,
  body: 0.06,
  frame: 0.05,
  locked: 0,
  software: 0.04,
  sim_slot: 0.035,
  water_damage: 0.15,
};

type PartOverrideMap = Partial<Record<string, number>>;

interface ModelPartHint {
  keyword: string;
  parts: PartOverrideMap;
}

// Явные ориентиры для популярных моделей (PLN, 2026) — точнее, чем только бренд-множитель.
const MODEL_PART_HINTS: ModelPartHint[] = [
  { keyword: "iphone 16 pro max", parts: { screen: 1350, battery: 300, back_cover: 240, charging_port: 160, camera: 420 } },
  { keyword: "iphone 16 pro", parts: { screen: 1150, battery: 280, back_cover: 220, charging_port: 150, camera: 380 } },
  { keyword: "iphone 15 pro max", parts: { screen: 1100, battery: 270, back_cover: 210, charging_port: 145, camera: 360 } },
  { keyword: "iphone 15 pro", parts: { screen: 980, battery: 250, back_cover: 195, charging_port: 135, camera: 320 } },
  { keyword: "iphone 15", parts: { screen: 820, battery: 220, back_cover: 170, charging_port: 120, camera: 280 } },
  { keyword: "iphone 14 pro max", parts: { screen: 950, battery: 240, back_cover: 185, charging_port: 125, camera: 300 } },
  { keyword: "iphone 14 pro", parts: { screen: 850, battery: 220, back_cover: 170, charging_port: 115, camera: 270 } },
  { keyword: "iphone 14", parts: { screen: 680, battery: 190, back_cover: 145, charging_port: 100, camera: 220 } },
  { keyword: "iphone 13 pro", parts: { screen: 720, battery: 200, back_cover: 155, charging_port: 105, camera: 240 } },
  { keyword: "iphone 13", parts: { screen: 580, battery: 175, back_cover: 130, charging_port: 95, camera: 190 } },
  { keyword: "iphone 12", parts: { screen: 480, battery: 150, back_cover: 110, charging_port: 85, camera: 160 } },
  { keyword: "iphone 11", parts: { screen: 380, battery: 130, back_cover: 95, charging_port: 75, camera: 130 } },
  { keyword: "iphone 13 pro max", parts: { screen: 820, battery: 220, back_cover: 170, charging_port: 110, camera: 260 } },
  { keyword: "iphone 12 pro max", parts: { screen: 620, battery: 170, back_cover: 130, charging_port: 95, camera: 200 } },
  { keyword: "iphone 7", parts: { screen: 180, battery: 80, back_cover: 60, charging_port: 45, camera: 70 } },
  { keyword: "galaxy s25 ultra", parts: { screen: 1050, battery: 220, back_cover: 180, charging_port: 120, camera: 320 } },
  { keyword: "galaxy s25 fe", parts: { screen: 480, battery: 160, back_cover: 110, charging_port: 80, camera: 190 } },
  { keyword: "galaxy s25", parts: { screen: 680, battery: 180, back_cover: 130, charging_port: 95, camera: 230 } },
  { keyword: "galaxy s24 ultra", parts: { screen: 920, battery: 200, back_cover: 165, charging_port: 110, camera: 290 } },
  { keyword: "galaxy s24", parts: { screen: 620, battery: 165, back_cover: 120, charging_port: 90, camera: 210 } },
  { keyword: "galaxy s23 ultra", parts: { screen: 780, battery: 185, back_cover: 150, charging_port: 100, camera: 260 } },
  { keyword: "galaxy s23", parts: { screen: 520, battery: 145, back_cover: 105, charging_port: 85, camera: 185 } },
  { keyword: "galaxy s20 fe", parts: { screen: 280, battery: 95, back_cover: 75, charging_port: 60, camera: 120 } },
  { keyword: "s20fe", parts: { screen: 280, battery: 95, back_cover: 75, charging_port: 60, camera: 120 } },
  { keyword: "galaxy s10", parts: { screen: 220, battery: 80, back_cover: 60, charging_port: 50, camera: 95 } },
  { keyword: "galaxy s9", parts: { screen: 180, battery: 70, back_cover: 50, charging_port: 45, camera: 80 } },
  { keyword: "galaxy z fold 7", parts: { screen: 1900, battery: 300, frame: 380 } },
  { keyword: "galaxy z fold 6", parts: { screen: 1800, battery: 280, frame: 350 } },
  { keyword: "galaxy z fold 5", parts: { screen: 1550, battery: 260, frame: 320 } },
  { keyword: "galaxy z fold4", parts: { screen: 1400, battery: 240, frame: 300 } },
  { keyword: "galaxy z flip 6", parts: { screen: 980, battery: 190, frame: 240 } },
  { keyword: "galaxy z flip 5", parts: { screen: 820, battery: 175, frame: 210 } },
  { keyword: "pixel 10 pro", parts: { screen: 780, battery: 190, back_cover: 140, charging_port: 100, camera: 260 } },
  { keyword: "pixel 10", parts: { screen: 620, battery: 170, back_cover: 120, charging_port: 90, camera: 210 } },
  { keyword: "pixel 9 pro", parts: { screen: 720, battery: 175, back_cover: 130, charging_port: 95, camera: 240 } },
  { keyword: "pixel 8 pro", parts: { screen: 620, battery: 160, back_cover: 115, charging_port: 85, camera: 210 } },
  { keyword: "pixel 8", parts: { screen: 480, battery: 140, back_cover: 100, charging_port: 75, camera: 175 } },
  { keyword: "redmi note 13 pro", parts: { screen: 280, battery: 85, back_cover: 65, charging_port: 55, camera: 110 } },
  { keyword: "redmi note 12", parts: { screen: 220, battery: 70, back_cover: 55, charging_port: 45, camera: 90 } },
  { keyword: "redmi 14", parts: { screen: 180, battery: 65, back_cover: 50, charging_port: 40, camera: 80 } },
  { keyword: "poco x6 pro", parts: { screen: 310, battery: 90, back_cover: 70, charging_port: 58, camera: 120 } },
  { keyword: "xiaomi mi 15", parts: { screen: 620, battery: 170, back_cover: 120, charging_port: 90, camera: 220 } },
  { keyword: "oneplus 12", parts: { screen: 580, battery: 155, back_cover: 115, charging_port: 82, camera: 195 } },
  { keyword: "oneplus 11", parts: { screen: 450, battery: 130, back_cover: 95, charging_port: 72, camera: 165 } },
];

const BRAND_REPAIRABILITY_STUB: Record<string, { score: number; scale: number }> = {
  apple: { score: 4.8, scale: 10 },
  samsung: { score: 5.5, scale: 10 },
  google: { score: 7.0, scale: 10 },
  xiaomi: { score: 7.5, scale: 10 },
  redmi: { score: 8.0, scale: 10 },
  poco: { score: 8.0, scale: 10 },
  oneplus: { score: 6.5, scale: 10 },
  motorola: { score: 7.0, scale: 10 },
  huawei: { score: 6.0, scale: 10 },
  honor: { score: 7.0, scale: 10 },
  oppo: { score: 7.0, scale: 10 },
  realme: { score: 7.5, scale: 10 },
  sony: { score: 5.0, scale: 10 },
  unknown: { score: 6.0, scale: 10 },
};

function findBestModelPartHint(model_query: string): ModelPartHint | null {
  const normalized = model_query.toLowerCase();
  let best: ModelPartHint | null = null;
  for (const hint of MODEL_PART_HINTS) {
    if (!normalized.includes(hint.keyword)) continue;
    if (!best || hint.keyword.length > best.keyword.length) best = hint;
  }
  return best;
}

export function resolveStubPartPrice(
  brand: string,
  model_query: string,
  damage_type: string,
  storage_gb: number | null = null,
): number {
  const model_hint = findBestModelPartHint(model_query);
  const explicit = model_hint?.parts[damage_type];
  if (explicit !== undefined) return explicit;

  const market_price = resolveStartingMarketPrice(brand, model_query, storage_gb);
  const ratio = MARKET_PRICE_PART_RATIOS[damage_type] ?? 0.05;
  if (market_price > 0 && ratio > 0) {
    return Math.round(market_price * ratio);
  }

  const multiplier = BRAND_PRICE_MULTIPLIER[brand] ?? 1;
  const base_price = BASE_PART_PRICES[damage_type] ?? 50;
  return Math.round(base_price * multiplier);
}

export function buildStaticPartStub(
  brand: string,
  model_query: string,
  model_label: string,
  damage_type: string,
  storage_gb: number | null = null,
): AllegroPart {
  const price = resolveStubPartPrice(brand, model_query, damage_type, storage_gb);
  const part_name = PART_NAMES[damage_type] ?? damage_type;
  const display_model = model_label.trim() || model_query.trim() || (brand !== "unknown" ? brand : "smartfon");
  const search_query = `${brand !== "unknown" ? brand : ""} ${model_query} ${part_name}`.trim();

  return {
    title: `${display_model} · ${part_name} ${PART_ESTIMATE_MARKER}`,
    price,
    currency: "PLN",
    url: buildOlxPartsSearchUrl(search_query),
    image: null,
    damage_type,
    is_estimate: true,
    source: "estimate",
  };
}

export function buildStaticPartStubs(
  brand: string,
  model_query: string,
  model_label: string,
  damage_types: string[],
  storage_gb: number | null = null,
): AllegroPart[] {
  return damage_types.map((damage_type) => buildStaticPartStub(
    brand,
    model_query,
    model_label,
    damage_type,
    storage_gb,
  ));
}

/** Дополняет список запчастей заглушками по каждому damage_type без реальной цены. */
export function ensurePartsStubsForDamageTypes(
  parts: AllegroPart[],
  damage_types: string[],
  brand: string,
  model_query: string,
  model_label: string,
  storage_gb: number | null = null,
): AllegroPart[] {
  if (damage_types.length === 0) return parts;

  const result = [...parts];

  for (const damage_type of damage_types) {
    const has_real_part = parts.some(
      (part) => part.damage_type === damage_type && part.price !== null && !isPartEstimate(part),
    );
    if (has_real_part) continue;

    const existing_stub = parts.find(
      (part) => part.damage_type === damage_type && isPartEstimate(part),
    );
    if (existing_stub) continue;

    result.push(buildStaticPartStub(brand, model_query, model_label, damage_type, storage_gb));
  }

  return result;
}

export function isPartEstimate(part: AllegroPart): boolean {
  return part.is_estimate === true || part.title.includes(PART_ESTIMATE_MARKER);
}

/** Пересчитывает ★-оценки по текущим ориентирам — без ожидания нового скана. */
export function refreshEstimatePartPrices(
  parts: AllegroPart[],
  brand: string,
  model_query: string,
  model_label: string,
  storage_gb: number | null = null,
): AllegroPart[] {
  return parts.map((part) => {
    if (!isPartEstimate(part) || !part.damage_type) return part;
    return {
      ...part,
      price: resolveStubPartPrice(brand, model_query, part.damage_type, storage_gb),
      title: part.title.includes(PART_ESTIMATE_MARKER)
        ? part.title
        : `${model_label || model_query} · ${part.damage_type} ${PART_ESTIMATE_MARKER}`,
    };
  });
}

export function getRepairabilityStub(brand: string): { repairability_score: number; repairability_scale: number } {
  const stub = BRAND_REPAIRABILITY_STUB[brand] ?? BRAND_REPAIRABILITY_STUB.unknown;
  return { repairability_score: stub.score, repairability_scale: stub.scale };
}

export function buildIfixitSearchStubUrl(device_query: string): string {
  return `https://www.ifixit.com/Search?query=${encodeURIComponent(device_query.trim())}`;
}

export function buildPartsSearchFallbackUrl(
  brand: string,
  model_query: string,
  damage_types: string[],
): string {
  return buildAllegroSearchUrl(brand, model_query, damage_types);
}

export function hasPartSearchKeyword(damage_type: string): boolean {
  return Boolean(PART_SEARCH_KEYWORDS[damage_type]);
}
