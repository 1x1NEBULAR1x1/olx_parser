import { containsKeyword } from "../text-match";

// Статическая таблица "keyword -> год выпуска", тот же паттерн, что уже
// использует GEEK_MODEL_SCORE_HINTS в constants.ts. Покрывает популярные на
// вторичном рынке Польши модели последних ~7 лет — известное ограничение:
// редкие/очень старые/будущие модели не покрытые таблицей вернут null (в
// UI/фильтре по году такие устройства не скрываются, чтобы не терять
// реальные лоты из-за пробела в справочнике — см. TODO.md).
//
// Порядок в массиве НЕ важен для корректности — getReleaseYear ищет среди
// ВСЕХ совпадений и берёт то, чей keyword длиннее (значит специфичнее),
// поэтому "galaxy s23 ultra" не даст спутать себя с более общим "galaxy s23".
const MODEL_RELEASE_YEAR_HINTS: Array<{ keyword: string; year: number }> = [
  // Apple iPhone
  { keyword: "iphone 17", year: 2025 },
  { keyword: "iphone 16 pro max", year: 2024 },
  { keyword: "iphone 16 pro", year: 2024 },
  { keyword: "iphone 16 plus", year: 2024 },
  { keyword: "iphone 16", year: 2024 },
  { keyword: "iphone 15 pro max", year: 2023 },
  { keyword: "iphone 15 pro", year: 2023 },
  { keyword: "iphone 15 plus", year: 2023 },
  { keyword: "iphone 15", year: 2023 },
  { keyword: "iphone 14 pro max", year: 2022 },
  { keyword: "iphone 14 pro", year: 2022 },
  { keyword: "iphone 14 plus", year: 2022 },
  { keyword: "iphone 14", year: 2022 },
  { keyword: "iphone 13 pro max", year: 2021 },
  { keyword: "iphone 13 pro", year: 2021 },
  { keyword: "iphone 13 mini", year: 2021 },
  { keyword: "iphone 13", year: 2021 },
  { keyword: "iphone se", year: 2022 },
  { keyword: "iphone 12 pro max", year: 2020 },
  { keyword: "iphone 12 pro", year: 2020 },
  { keyword: "iphone 12 mini", year: 2020 },
  { keyword: "iphone 12", year: 2020 },
  { keyword: "iphone 11 pro max", year: 2019 },
  { keyword: "iphone 11 pro", year: 2019 },
  { keyword: "iphone 11", year: 2019 },
  { keyword: "iphone xs", year: 2018 },
  { keyword: "iphone xr", year: 2018 },
  { keyword: "iphone x", year: 2017 },
  { keyword: "iphone 8", year: 2017 },
  { keyword: "iphone 7", year: 2016 },
  { keyword: "iphone 6s", year: 2015 },
  { keyword: "iphone 6", year: 2014 },

  // Samsung Galaxy S / Note / Z
  { keyword: "galaxy s25 ultra", year: 2025 },
  { keyword: "galaxy s25", year: 2025 },
  { keyword: "galaxy s24 ultra", year: 2024 },
  { keyword: "galaxy s24 fe", year: 2024 },
  { keyword: "galaxy s24", year: 2024 },
  { keyword: "galaxy s23 ultra", year: 2023 },
  { keyword: "galaxy s23 fe", year: 2023 },
  { keyword: "galaxy s23", year: 2023 },
  { keyword: "galaxy s22 ultra", year: 2022 },
  { keyword: "galaxy s22", year: 2022 },
  { keyword: "galaxy s21 ultra", year: 2021 },
  { keyword: "galaxy s21 fe", year: 2021 },
  { keyword: "galaxy s21", year: 2021 },
  { keyword: "galaxy s20", year: 2020 },
  { keyword: "galaxy s10", year: 2019 },
  { keyword: "galaxy s9", year: 2018 },
  { keyword: "galaxy s8", year: 2017 },
  { keyword: "galaxy note 20", year: 2020 },
  { keyword: "galaxy note 10", year: 2019 },
  { keyword: "galaxy note 9", year: 2018 },
  { keyword: "galaxy z fold 6", year: 2024 },
  { keyword: "galaxy z fold 5", year: 2023 },
  { keyword: "galaxy z fold 4", year: 2022 },
  { keyword: "galaxy z fold 3", year: 2021 },
  { keyword: "galaxy z flip 6", year: 2024 },
  { keyword: "galaxy z flip 5", year: 2023 },
  { keyword: "galaxy z flip 4", year: 2022 },

  // Samsung Galaxy A
  { keyword: "galaxy a56", year: 2025 },
  { keyword: "galaxy a55", year: 2024 },
  { keyword: "galaxy a54", year: 2023 },
  { keyword: "galaxy a53", year: 2022 },
  { keyword: "galaxy a52", year: 2021 },
  { keyword: "galaxy a51", year: 2019 },
  { keyword: "galaxy a35", year: 2024 },
  { keyword: "galaxy a34", year: 2023 },
  { keyword: "galaxy a33", year: 2022 },
  { keyword: "galaxy a25", year: 2024 },
  { keyword: "galaxy a24", year: 2023 },
  { keyword: "galaxy a23", year: 2022 },
  { keyword: "galaxy a16", year: 2024 },
  { keyword: "galaxy a15", year: 2023 },
  { keyword: "galaxy a14", year: 2023 },
  { keyword: "galaxy a13", year: 2022 },
  { keyword: "galaxy a12", year: 2021 },

  // Xiaomi / Redmi / POCO
  { keyword: "xiaomi 14", year: 2023 },
  { keyword: "xiaomi 13", year: 2022 },
  { keyword: "xiaomi 12", year: 2021 },
  { keyword: "mi 11", year: 2021 },
  { keyword: "mi 10", year: 2020 },
  { keyword: "redmi note 13", year: 2024 },
  { keyword: "redmi note 12", year: 2023 },
  { keyword: "redmi note 11", year: 2022 },
  { keyword: "redmi note 10", year: 2021 },
  { keyword: "poco x6", year: 2024 },
  { keyword: "poco x5", year: 2023 },
  { keyword: "poco x4", year: 2022 },
  { keyword: "poco x3", year: 2020 },
  { keyword: "poco f5", year: 2023 },
  { keyword: "poco f4", year: 2022 },

  // Google Pixel
  { keyword: "pixel 9 pro", year: 2024 },
  { keyword: "pixel 9", year: 2024 },
  { keyword: "pixel 8 pro", year: 2023 },
  { keyword: "pixel 8", year: 2023 },
  { keyword: "pixel 7 pro", year: 2022 },
  { keyword: "pixel 7", year: 2022 },
  { keyword: "pixel 6", year: 2021 },

  // OnePlus
  { keyword: "oneplus 12", year: 2024 },
  { keyword: "oneplus 11", year: 2023 },
  { keyword: "oneplus 10", year: 2022 },
  { keyword: "oneplus 9", year: 2021 },

  // Huawei / Honor
  { keyword: "p60", year: 2023 },
  { keyword: "p50", year: 2021 },
  { keyword: "p40", year: 2020 },
  { keyword: "p30", year: 2019 },
  { keyword: "honor 90", year: 2023 },
  { keyword: "honor 70", year: 2022 },
  { keyword: "honor 50", year: 2021 },
];

/**
 * Ищет год выпуска по канонической строке model_key (см. model-normalizer.ts).
 * Возвращает null, если ни один keyword из справочника не совпал — вызывающий
 * код (liquidity/фильтр по году) должен относиться к null как "неизвестно",
 * а не как "0"/"старый".
 */
export function getReleaseYear(model_key: string): number | null {
  let best_match: { keyword: string; year: number } | null = null;

  for (const hint of MODEL_RELEASE_YEAR_HINTS) {
    if (!containsKeyword(model_key, hint.keyword)) continue;
    if (!best_match || hint.keyword.length > best_match.keyword.length) {
      best_match = hint;
    }
  }

  return best_match?.year ?? null;
}
