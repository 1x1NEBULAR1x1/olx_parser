// Ориентировочные цены на запчасти в Польше (PLN, 2026)
// Используются как fallback когда Allegro API/scraper недоступен

export interface StaticPartEstimate {
  damage_type: string;
  part_name: string;
  price_estimate: number;
  allegro_search_query: string;
}

const BRAND_PRICE_MULTIPLIER: Record<string, number> = {
  apple: 2.8,
  samsung: 1.5,
  google: 1.6,
  oneplus: 1.3,
  sony: 1.4,
  huawei: 1.1,
  xiaomi: 0.85,
  redmi: 0.75,
  poco: 0.75,
  motorola: 0.8,
  honor: 0.8,
  oppo: 0.85,
  realme: 0.7,
  unknown: 1.0,
};

const BASE_PART_PRICES: Record<string, number> = {
  screen: 180,
  battery: 60,
  back_cover: 45,
  buttons: 25,
  charging_port: 40,
  camera: 90,
  speaker: 30,
  microphone: 25,
  body: 50,
  frame: 45,
  locked: 0,
  software: 80,
  sim_slot: 55,
  water_damage: 120,
};

export const PART_NAMES: Record<string, string> = {
  screen: "Wyświetlacz LCD/AMOLED",
  battery: "Bateria",
  back_cover: "Tylna obudowa / szkło",
  buttons: "Przyciski volume/power",
  charging_port: "Złącze ładowania USB-C",
  camera: "Moduł aparatu",
  speaker: "Głośnik",
  microphone: "Mikrofon",
  body: "Ramka / obudowa",
  frame: "Ramka / bezel",
  locked: "Odblokowanie konta",
  software: "Naprawa systemu / flash",
  sim_slot: "Gniazdo SIM / tacka",
  water_damage: "Naprawa po zalaniu",
};

// Ключевые слова для поиска на Ceneo (короткие, точные)
export const PART_SEARCH_KEYWORDS: Record<string, string> = {
  screen: "wyświetlacz ekran",
  battery: "bateria",
  back_cover: "tylna obudowa szkło",
  buttons: "przyciski boczne",
  charging_port: "złącze ładowania gniazdo USB",
  camera: "aparat kamera moduł",
  speaker: "głośnik",
  microphone: "mikrofon",
  body: "ramka obudowa",
  frame: "ramka bezel",
  locked: "odblokowanie icloud frp",
  software: "naprawa systemu flash",
  sim_slot: "gniazdo sim tacka",
  water_damage: "naprawa po zalaniu woda",
};

export function getStaticPartsEstimate(
  brand: string,
  model_query: string,
  damage_types: string[],
): StaticPartEstimate[] {
  const multiplier = BRAND_PRICE_MULTIPLIER[brand] ?? 1.0;

  return damage_types.map((damage_type) => {
    const base_price = BASE_PART_PRICES[damage_type] ?? 50;
    const price = Math.round(base_price * multiplier);
    const part_name = PART_NAMES[damage_type] ?? damage_type;
    const search_query = `${brand !== "unknown" ? brand : ""} ${model_query} ${part_name}`.trim();

    return {
      damage_type,
      part_name: `${part_name} (${brand !== "unknown" ? brand : "zamiennik"})`,
      price_estimate: price,
      allegro_search_query: search_query,
    };
  });
}

export function buildAllegroSearchUrl(brand: string, model_query: string, damage_types: string[]): string {
  const search_terms = damage_types.map((dt) => PART_NAMES[dt] ?? dt).slice(0, 2);
  // Избегаем дублирования бренда если он уже входит в model_query
  const brand_str = brand !== "unknown" ? brand : "";
  const model_without_brand = model_query.toLowerCase().startsWith(brand.toLowerCase())
    ? model_query.split(" ").slice(1, 3).join(" ")
    : model_query.split(" ").slice(0, 2).join(" ");
  const query = [brand_str, model_without_brand, ...search_terms].filter(Boolean).join(" ");
  return `https://allegro.pl/listing?string=${encodeURIComponent(query)}&category=122938`;
}
