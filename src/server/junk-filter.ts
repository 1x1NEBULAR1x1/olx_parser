// "Режим исключения мусора" — настраиваемый в /settings фильтр (AppSettings,
// вкл. по умолчанию), убирающий из выдачи объявления, которые технически
// парсятся, но не являются нормальной продажей одного б/у смартфона:
// слишком старые модели, лоты/пачки телефонов, объявления сервисов ремонта,
// нереалистичные цены (опечатка/шутка/деталь без самого телефона).
//
// Год выпуска — часть этого же режима (не отдельная независимая настройка):
// порог `junk_min_release_year` живёт в AppSettings рядом с
// `exclude_junk_listings` и применяется только когда общий тоггл включён.

export interface JunkFilterSettings {
  exclude_junk_listings: boolean;
  junk_min_release_year: number;
}

export type JunkReason =
  | "unknown_model"
  | "old_model"
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

function containsAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

/**
 * Определяет, является ли объявление "мусором" при включённом режиме
 * исключения. Вызывается ДВАЖДЫ в пайплайне: сразу после определения
 * brand/model_key/release_year (до дорогих сетевых запросов — экономит время
 * скана на очевидном мусоре) и повторно после получения post_summary
 * (описания объявления), чтобы поймать лоты/сервисы, упомянутые только в
 * тексте, а не в заголовке.
 */
export function evaluateJunkStatus(input: JunkCheckInput, settings: JunkFilterSettings): JunkCheckResult {
  if (!settings.exclude_junk_listings) {
    return { is_junk: false, reason: null };
  }

  if (input.brand === "unknown" || !input.model_key.trim()) {
    return { is_junk: true, reason: "unknown_model" };
  }

  if (input.release_year !== null && input.release_year < settings.junk_min_release_year) {
    return { is_junk: true, reason: "old_model" };
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
