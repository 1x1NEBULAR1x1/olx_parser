// "Режим исключения мусора" — персональная настройка пользователя
// (UserDisplaySettings, вкл. по умолчанию), убирающий из ленты объявления...
//
// Год выпуска — часть этого же режима (не отдельная независимая настройка):
// порог `junk_min_release_year` живёт в UserDisplaySettings рядом с
// `exclude_junk_listings` и применяется только когда общий тоггл включён.

import { getReleaseYear } from "./liquidity-calculator/release-year-hints";
import { containsKeyword } from "./text-match";

export interface JunkFilterSettings {
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
}

export type JunkReason =
  | "unknown_model"
  | "old_model"
  | "feature_phone"
  | "lot_listing"
  | "parts_only_listing"
  | "service_ad"
  | "unrealistic_price_low"
  | "unrealistic_price_high";

export interface JunkCheckInput {
  title: string;
  // На раннем этапе (до сетевого запроса за текстом объявления) описание
  // ещё не известно — передавайте "", проверка просто пропустит
  // признаки, которые видны только в тексте описания.
  post_summary: string;
  brand: string;
  model_key: string;
  price_buy: number | null;
  release_year: number | null;
}

export interface JunkCheckResult {
  is_junk: boolean;
  reason: JunkReason | null;
}

// Дешевле реальной б/у запчасти — почти наверняка не целый рабочий/битый
// телефон, а деталь, муляж или объявление-шутка/ошибка в цене.
const MIN_REALISTIC_PRICE_PLN = 20;
// Дороже — либо опечатка в цене (лишний ноль), либо коллекционный/эксклюзивный
// лот, не подходящий под обычную арбитражную схему "купить-починить-продать".
const MAX_REALISTIC_PRICE_PLN = 12000;

// Объявления-лоты (продажа сразу нескольких телефонов пачкой) — их
// "цена покупки" не относится к одному устройству, поэтому вся экономика
// (прибыльность/ликвидность) для них считается неверно.
const LOT_KEYWORDS = [
  "zestaw telefonów", "zestaw telefonow", "paczka telefonów", "paczka telefonow",
  "partia telefonów", "partia telefonow", "lot telefonów", "lot telefonow",
  "kilka sztuk", "kilkanaście sztuk", "kilkanascie sztuk", "hurtowo",
  "na sztuki", "działka telefonów", "dzialka telefonow",
  "telefony na części", "telefony na czesci", "paczka uszkodzonych",
  // Продавцы часто пишут количество СЛОВОМ, а не цифрой ("dwie sztuki" —
  // "две штуки") — MULTI_UNIT_REGEX ниже ловит только цифровую форму ("2 szt").
  "dwie sztuki", "dwa telefony", "trzy sztuki", "trzy telefony",
  "dwoje telefonów", "dwoje telefonow", "oba telefony",
  // Лоты «старых телефонов» — не один смартфон для ремонта.
  "stare telefony", "stare telefon", "stary telefon", "stara telefon",
  "stare smartfony", "stare smartfon", "stary smartfon", "stara smartfon",
  "telefony stare", "smartfony stare", "mix telefonów", "mix telefonow",
  "różne telefony", "rozne telefony", "różne modele", "rozne modele",
  "kilka telefonów", "kilka telefonow", "kilka smartfonów", "kilka smartfonow",
  "stare modele", "stary model", "stare modele telefonów", "stare modele telefonow",
];

// Явные устаревшие iPhone/Android — подстраховка, если release_year не сохранён в БД.
const LEGACY_MODEL_KEYWORDS = [
  "iphone 5c", "iphone 5s", "iphone 5", "iphone 4s", "iphone 4",
  "iphone 3gs", "iphone 3g", "iphone 3",
  "galaxy s3", "galaxy s4", "galaxy s5", "galaxy s6 mini",
  "galaxy note 3", "galaxy note 4", "galaxy note 5",
];

// Объявления «только на запчасти» — целого устройства для ремонта нет.
const PARTS_ONLY_KEYWORDS = [
  "na części", "na czesci", "tylko na części", "tylko na czesci",
  "for parts", "parts only", "na czesci zamienne", "na części zamienne",
  "uszkodzony na części", "uszkodzony na czesci", "bez możliwości naprawy",
  "bez mozliwosci naprawy", "nie nadaje się do naprawy", "nie nadaje sie do naprawy",
  "wyłącznie na części", "wylacznie na czesci", "podzespoły", "podzespoly",
];

// Объявления сервисов ремонта продают услугу, а не конкретное устройство —
// у них нет реальной "цены покупки телефона".
const SERVICE_KEYWORDS = [
  "serwis telefonów", "serwis telefonow", "naprawa telefonów", "naprawa telefonow",
  "naprawa wyświetlaczy", "naprawa wyswietlaczy", "wymiana wyświetlaczy", "wymiana wyswietlaczy",
  "usługa naprawy", "usluga naprawy", "profesjonalny serwis", "punkt serwisowy", "serwis gsm",
];

// "5 szt", "12 sztuk", "3 telefony" — числительное перед словом-маркером лота;
// нижняя граница 2, потому что "1 szt" — это, наоборот, обычное уточнение
// количества в единичном объявлении.
const MULTI_UNIT_REGEX = /\b(\d{1,3})\s*(?:szt\.?|sztuk|telefon(?:y|ów|ow)?|urządze(?:nia|ń)|urzadze(?:nia|n))\b/i;

// Кнопочные / «раскладушки» — не смартфоны для арбитража ремонта.
// Nokia 3310, 8210 и т.п. часто проходят фильтр по году, т.к. release_year
// неизвестен (нет в release-year-hints) или равен 2017 (реимейк).
const FEATURE_PHONE_TITLE_KEYWORDS = [
  "telefon z klapką", "telefon z klapka", "telefon klapkowy",
  "nokia 3310", "nokia 8210", "nokia 6310", "nokia 5110", "nokia 2720",
  "nokia 1100", "nokia 8110", "nokia 8850", "nokia 3210",
  "telefon komórkowy nokia", "telefon komorkowy nokia",
  "klasyczny nokia", "stary nokia", "stara nokia",
];

// Android-смартфоны Nokia (G/X/C и линейка с десятичным номером 1–9).
const NOKIA_SMARTPHONE_LINE_REGEX = /^nokia (?:[gxc]\d|(?:[1-9](?:\.\d+)?)(?:\s|$))/i;
const NOKIA_FEATURE_PHONE_MODEL_REGEX = /^nokia \d{3,4}[a-z]?(?:\s+(?:plus|flip))?$/i;

function containsAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function isFeaturePhoneListing(brand: string, model_key: string, title: string, post_summary: string): boolean {
  const model = model_key.toLowerCase().trim();
  const full_text = `${title} ${post_summary} ${model_key}`.toLowerCase();

  if (containsAnyPhrase(full_text, FEATURE_PHONE_TITLE_KEYWORDS)) {
    return true;
  }

  if (brand === "nokia") {
    if (NOKIA_SMARTPHONE_LINE_REGEX.test(model)) {
      return false;
    }
    if (NOKIA_FEATURE_PHONE_MODEL_REGEX.test(model)) {
      return true;
    }
  }

  // Другие бренды: старые кнопочные серии Samsung (E/C/B/D + 3 цифры).
  if (brand === "samsung" && /^samsung [ecbd]\d{3}\b/i.test(model)) {
    return true;
  }

  return false;
}

function resolveReleaseYear(input: JunkCheckInput): number | null {
  if (input.release_year !== null) {
    return input.release_year;
  }
  const from_model = getReleaseYear(input.model_key);
  if (from_model !== null) {
    return from_model;
  }
  return getReleaseYear(input.title.toLowerCase());
}

function isLegacyModelListing(model_key: string, title: string, post_summary: string): boolean {
  const full_text = `${model_key} ${title} ${post_summary}`.toLowerCase();
  return LEGACY_MODEL_KEYWORDS.some((keyword) => containsKeyword(full_text, keyword));
}

/**
 * Определяет, является ли объявление "мусором" при включённом режиме
 * исключения. Используется при отдаче ленты (`applyUserDisplayFilters`).
 */
export function evaluateJunkStatus(input: JunkCheckInput, settings: JunkFilterSettings): JunkCheckResult {
  if (!settings.exclude_junk_listings) {
    return { is_junk: false, reason: null };
  }

  if (input.brand === "unknown" || !input.model_key.trim()) {
    return { is_junk: true, reason: "unknown_model" };
  }

  const release_year = resolveReleaseYear(input);
  if (release_year !== null && release_year < settings.junk_min_release_year) {
    return { is_junk: true, reason: "old_model" };
  }

  if (isLegacyModelListing(input.model_key, input.title, input.post_summary)) {
    return { is_junk: true, reason: "old_model" };
  }

  if (isFeaturePhoneListing(input.brand, input.model_key, input.title, input.post_summary)) {
    return { is_junk: true, reason: "feature_phone" };
  }

  const full_text = `${input.title} ${input.post_summary}`.toLowerCase();

  if (containsAnyPhrase(full_text, LOT_KEYWORDS)) {
    return { is_junk: true, reason: "lot_listing" };
  }
  if (containsAnyPhrase(full_text, PARTS_ONLY_KEYWORDS)) {
    return { is_junk: true, reason: "parts_only_listing" };
  }
  if (containsAnyPhrase(full_text, SERVICE_KEYWORDS)) {
    return { is_junk: true, reason: "service_ad" };
  }
  const multi_match = full_text.match(MULTI_UNIT_REGEX);
  if (multi_match && Number(multi_match[1]) >= 2) {
    return { is_junk: true, reason: "lot_listing" };
  }

  if (input.price_buy !== null) {
    if (input.price_buy < MIN_REALISTIC_PRICE_PLN) return { is_junk: true, reason: "unrealistic_price_low" };
    if (input.price_buy > MAX_REALISTIC_PRICE_PLN) return { is_junk: true, reason: "unrealistic_price_high" };
  }

  return { is_junk: false, reason: null };
}
