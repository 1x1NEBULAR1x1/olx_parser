import type { ParsedOlxListing } from "./fetcher";
import { getKeywordContexts } from "@/server/domain/text-match";
import { createConcurrencyLimiter, fetchWithTimeout } from "@/server/shared/concurrency-limiter";

// Ограничиваем параллелизм отдельно для каждого внешнего сайта — иначе при
// увеличении общей конкурентности пайплайна (config.pipeline.concurrency)
// можно легко выстрелить десятками одновременных запросов в один хост.
const olx_page_limiter = createConcurrencyLimiter(6, 80);
const ifixit_limiter = createConcurrencyLimiter(4, 100);

const IFIXIT_SEARCH_PAGE_URL = "https://www.ifixit.com/search?query=";
const IFIXIT_ALGOLIA_MULTI_QUERY_URL =
  "https://xqep3ad9zt-dsn.algolia.net/1/indexes/*/queries?x-algolia-agent=Algolia%20for%20JavaScript%20(4.24.0)%3B%20Browser";
const IFIXIT_BASE_URL = "https://www.ifixit.com";

type DamageType =
  | "screen"
  | "battery"
  | "back_cover"
  | "buttons"
  | "charging_port"
  | "camera"
  | "speaker"
  | "microphone"
  | "body"
  | "frame"
  | "locked"
  | "software"
  | "sim_slot"
  | "water_damage";

export type { DamageType };

interface IfixitTopicHit {
  title?: string;
  device?: string;
  url?: string;
  doctype?: string;
}

interface IfixitMultiSearchResponse {
  results?: Array<{
    hits?: IfixitTopicHit[];
  }>;
}

interface IfixitAlgoliaCredentials {
  app_id: string;
  api_key: string;
}

export interface IfixitDeviceMatch {
  device_name: string | null;
  device_url: string | null;
  repairability_score: number | null;
  repairability_scale: number | null;
  release_year: number | null;
}

export interface OlxFixAnalysisResult {
  listing_id: number;
  listing_title: string;
  listing_url: string;
  device_query: string;
  device_match: IfixitDeviceMatch;
  damage_types: DamageType[];
  post_summary: string;
}

// Ключи для польских существительных заданы в виде основы без родового окончания
// ("obudow", "bateri", "matryc"), потому что containsKeyword сам умеет
// дописывать типичные падежные окончания (-a, -y, -ie, -ę, -om, ...) — так одна
// запись покрывает "obudowa"/"obudowy"/"obudowie"/"obudowę" и т.п. без явного
// перечисления каждой формы.
const damage_dictionary: Record<DamageType, string[]> = {
  screen: [
    "screen",
    "display",
    "lcd",
    "oled",
    "digitizer",
    "touch",
    "ekran",
    "wyswietlacz",
    "wyświetlacz",
    "szybk",
    "dotyk",
    "matryc",
  ],
  battery: ["battery", "bateri", "akumulator", "bateryj", "nie trzyma baterii"],
  back_cover: ["back glass", "back cover", "tylna klapk", "klapk", "pleck", "pokrywa tylna"],
  buttons: ["button", "buttons", "przycisk", "guzik", "volume", "power", "action button"],
  charging_port: [
    "charging port",
    "usb-c",
    "lightning",
    "złącze ładowania",
    "zlacze ladowania",
    "port ładowania",
    "port ladowania",
    "gniazdo ładowania",
    "gniazdo ladowania",
    "nie ładuje",
    "nie laduje",
  ],
  camera: ["camera", "kamera", "aparat", "face id", "front cam", "rear cam", "obiektyw"],
  speaker: ["speaker", "glosnik", "głośnik", "earpiece", "loudspeaker"],
  microphone: ["microphone", "mikrofon", "mic"],
  body: ["housing", "obudow", "korpus", "bent", "wygięty", "wygiety", "stluczon", "stłuczon"],
  frame: ["frame", "ramk", "bezel", "obwódk", "obwodk", "rant", "uszkodzona ramka", "uszkodzony rant"],
  locked: [
    "icloud lock", "icloud locked", "find my", "findmy", "activation lock",
    "frp lock", "frp", "google lock", "blokada icloud", "blokada konta",
    "zablokowany icloud", "zablokowany kontem", "blacklist", "czarna lista",
    "simlock", "sim lock", "blokada operatora", "blokada sieci",
    "nieaktywowany", "wymaga odblokowania",
  ],
  software: [
    "bootloop", "boot loop", "nie wlacza sie", "nie włącza się", "nie uruchamia",
    "zawiesza sie", "zawiesza się", "restartuje", "ciagle restart", "ciągle restart",
    "problem z systemem", "błąd systemu", "blad systemu", "software issue",
    "nie dziala system", "nie działa system", "stuck on logo", "apple logo",
  ],
  sim_slot: [
    "sim slot", "sim tray", "szufladka sim", "gniazdo sim", "nie widzi sim",
    "nie czyta sim", "nie wykrywa sim", "uszkodzone gniazdo sim", "dual sim nie dziala",
    "dual sim nie działa", "karta sim nie dziala", "karta sim nie działa",
  ],
  water_damage: [
    "water damage", "water damaged", "po wodzie", "pod wode", "pod wodę",
    "zalan", "zalany", "zalana", "zalanie", "zlal", "zlana", "po zalaniu",
    "woda", "wodą", "wodzie", "wilgoc", "wilgoć", "korozja", "korozj",
    "oksydacja", "oxidation", "urywany kontakt z woda", "kontakt z woda",
    "zalany telefon", "zalany smartfon", "po deszczu", "wpadl do wody",
  ],
};

const stop_words = [
  "uszkodzony",
  "uszkodzone",
  "uszkodzona",
  "na czesci",
  "na części",
  "części",
  "czesci",
  "parts",
  "for parts",
  "broken",
  "damaged",
  "nie dziala",
  "nie działa",
  "nie wlacza",
  "nie włącza",
  "sprzedam",
];

// Расширение поиска на объявления в состоянии "used" (б/у, не только
// "damaged") привело к тому, что упоминание запчасти рядом со словом
// "новая"/"100%"/"исправна" почти всегда означает достоинство объявления
// ("bateria 100%", "nowy wyświetlacz"), а не повреждение, которое нужно
// ремонтировать. Если ВСЕ вхождения keyword'а в тексте окружены таким
// маркером здоровья — не считаем это повреждением.
// normalizeText вырезает "%" (не входит в разрешённый набор символов), поэтому
// маркеры вида "100%" нужно задавать уже без знака процента — иначе никогда
// не сматчатся после нормализации.
const HEALTH_MARKERS = [
  "nowa", "nowy", "nowe", "nowo",
  "sprawna", "sprawny", "sprawne", "sprawnie",
  "idealny", "idealna", "idealne", "idealnym",
  "100", "wymieniona", "wymieniony", "wymienione", "wymieniana",
  "bez rys", "bez wad", "bez uszkodzen", "bez uszkodzeń",
  "bez zarzutu", "zero problemow", "zero problemów", "bez problemu", "bez problemow",
  "dziala bez", "działa bez", "dzialaja bez", "działają bez",
  "wszystko dziala", "wszystko działa", "w pelni sprawny", "w pełni sprawny",
  "jak nowy", "jak nowa", "jak nowe", "prawidlowo", "prawidłowo",
];

// Явные признаки повреждения — если встречаются в том же окне, что и ключевое
// слово запчасти, всегда считаем это повреждением, даже если рядом же
// затесался маркер здоровья (защищает от кейсов вида "100% uszkodzony ekran",
// где "100" — не про здоровье, а часть фразы про степень повреждения).
const STRONG_DAMAGE_MARKERS = [
  "uszkodzon", "pekniet", "pęknięt", "spalon", "nie dziala", "nie działa",
  "wybit", "rozbit", "zalan", "stluczon", "stłuczon", "porysowan", "pekni", "pękni",
  "zarysowan", "rysek", "rysk",
];

// "bez rys, pęknięć i większych śladów użytkowania" — częstая формулировка
// в объявлениях "used": продавец перечисляет через запятую, ЧЕГО нет
// (rys, pęknięć = царапин, трещин), одним "bez" на всё перечисление.
// Простой includes() на STRONG_DAMAGE_MARKERS такое не различает — считаем
// повреждение отрицанным, если "bez" встречается в тех же ~15 символах
// до найденного маркера повреждения.
const NEGATION_WORDS = ["bez", "nie ma", "brak"];

function isNegated(context: string, marker: string): boolean {
  const marker_index = context.indexOf(marker);
  if (marker_index === -1) return false;
  const preceding_text = context.slice(Math.max(0, marker_index - 20), marker_index);
  return NEGATION_WORDS.some((negation) => preceding_text.includes(negation));
}

function isKeywordSurroundedByHealthMarker(context: string): boolean {
  const damage_marker = STRONG_DAMAGE_MARKERS.find((marker) => context.includes(marker));
  if (damage_marker) {
    return isNegated(context, damage_marker);
  }
  return HEALTH_MARKERS.some((marker) => context.includes(marker));
}

// Фразы, которыми продавцы на OLX обычно указывают на наличие оригинальной
// коробки/полного комплекта — используется для бонуса к рыночной цене
// (BOX_AND_ACCESSORIES_BONUS_SCORE в liquidity-calculator/constants.ts).
const BOX_PHRASES = [
  "z pudelkiem", "z pudełkiem", "oryginalne pudelko", "oryginalne pudełko",
  "pudelko oryginalne", "pudełko oryginalne", "komplet akcesoriow", "komplet akcesoriów",
  "wszystkie akcesoria", "pelny zestaw", "pełny zestaw", "kompletny zestaw",
  "box i wszystko", "w pudelku", "w pudełku", "orginalne pudelko",
];

export function detectHasBox(text: string): boolean {
  const normalized_text = normalizeText(text);
  if (!normalized_text) return false;
  return BOX_PHRASES.some((phrase) => normalized_text.includes(normalizeText(phrase)));
}

// Regex ищет упоминание батареи/аккумулятора и число в пределах ~15 символов
// перед знаком "%" — работает на СЫРОМ (не нормализованном) тексте, потому
// что normalizeText вырезает "%". Возвращает первое разумное значение (0-100).
const BATTERY_PERCENT_REGEX =
  /(bateria|baterii|akumulator|akumulatora|kondycja\s*bateri[ai]|battery)[^\d%]{0,20}(\d{1,3})\s*%/iu;

export function extractBatteryHealthPercent(text: string): number | null {
  const match = text.match(BATTERY_PERCENT_REGEX);
  if (!match?.[2]) return null;
  const value = Number.parseInt(match[2], 10);
  if (Number.isNaN(value) || value < 0 || value > 100) return null;
  return value;
}

let cached_algolia_credentials: IfixitAlgoliaCredentials | null = null;

function normalizeText(input_text: string): string {
  return input_text
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(input_text: string): string {
  return input_text
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractDeviceQueryFromTitle(title: string): string {
  const normalized_title = normalizeText(title);
  let device_query = normalized_title;

  for (const word of stop_words) {
    const escaped_word = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    device_query = device_query.replace(new RegExp(`\\b${escaped_word}\\b`, "g"), " ");
  }

  return device_query.replace(/\s+/g, " ").trim();
}

function detectDamageTypes(input_text: string, battery_threshold_percent?: number | null): DamageType[] {
  const normalized_text = normalizeText(input_text);
  if (!normalized_text) {
    return [];
  }

  const detected_types: DamageType[] = [];
  for (const [damage_type, keywords] of Object.entries(damage_dictionary) as Array<
    [DamageType, string[]]
  >) {
    // getKeywordContexts матчит по границе слова (как containsKeyword) —
    // raw includes() ложно матчил, например, "power" (buttons) внутри
    // "powerbank" или "mic" (microphone) внутри "chemicznie".
    const has_match = keywords.some((keyword) => {
      const normalized_keyword = normalizeText(keyword);
      const contexts = getKeywordContexts(normalized_text, normalized_keyword, 40);
      if (contexts.length === 0) return false;
      // Если ХОТЯ БЫ одно вхождение не окружено маркером здоровья — считаем
      // это реальным повреждением (например, в тексте может быть и "nowa
      // bateria w komplecie" и отдельно "ekran popekany" — второе важнее).
      return contexts.some((context) => !isKeywordSurroundedByHealthMarker(context));
    });
    if (has_match) {
      detected_types.push(damage_type);
    }
  }

  // Числовой % АКБ, если он извлечён из объявления, ПЕРЕОПРЕДЕЛЯЕТ эвристику
  // по ключевым словам — он точнее любых текстовых маркеров здоровья.
  if (battery_threshold_percent != null) {
    const battery_percent = extractBatteryHealthPercent(input_text);
    if (battery_percent != null) {
      const battery_index = detected_types.indexOf("battery");
      if (battery_percent < battery_threshold_percent && battery_index === -1) {
        detected_types.push("battery");
      } else if (battery_percent >= battery_threshold_percent && battery_index !== -1) {
        detected_types.splice(battery_index, 1);
      }
    }
  }

  return detected_types;
}

function getRepairabilityFromHtml(html: string): { score: number | null; scale: number | null } {
  const score_match = html.match(
    /Repairability:\s*<strong>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/strong>\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i,
  );
  if (!score_match?.[1] || !score_match?.[2]) {
    return { score: null, scale: null };
  }

  const score = Number.parseFloat(score_match[1]);
  const scale = Number.parseFloat(score_match[2]);
  if (!Number.isFinite(score) || !Number.isFinite(scale)) {
    return { score: null, scale: null };
  }

  return { score, scale };
}

async function getIfixitAlgoliaCredentials(): Promise<IfixitAlgoliaCredentials> {
  if (cached_algolia_credentials) {
    return cached_algolia_credentials;
  }

  const response = await ifixit_limiter(() => fetchWithTimeout(`${IFIXIT_SEARCH_PAGE_URL}iphone`, {}, 8000));
  if (!response.ok) {
    throw new Error(`iFixit search page error ${response.status}`);
  }

  const html = await response.text();
  const config_match = html.match(
    /"algoliaConfig"\s*:\s*\{\s*"appId"\s*:\s*"([^"]+)"\s*,\s*"apiKey"\s*:\s*"([^"]+)"/i,
  );
  if (!config_match?.[1] || !config_match?.[2]) {
    throw new Error("Не удалось получить algoliaConfig с iFixit.");
  }

  cached_algolia_credentials = {
    app_id: config_match[1],
    api_key: decodeHtmlEntities(config_match[2]),
  };

  return cached_algolia_credentials;
}

async function searchIfixitDevice(device_query: string): Promise<IfixitTopicHit | null> {
  const credentials = await getIfixitAlgoliaCredentials();

  const payload = {
    requests: [
      {
        indexName: "topic_en",
        query: device_query,
        params: "hitsPerPage=3",
      },
    ],
  };

  const response = await ifixit_limiter(() =>
    fetchWithTimeout(IFIXIT_ALGOLIA_MULTI_QUERY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algolia-application-id": credentials.app_id,
        "x-algolia-api-key": credentials.api_key,
      },
      body: JSON.stringify(payload),
    }, 8000),
  );

  if (!response.ok) {
    throw new Error(`iFixit Algolia error ${response.status}`);
  }

  const body = (await response.json()) as IfixitMultiSearchResponse;
  const hits = body.results?.[0]?.hits ?? [];
  const topic_hit = hits.find((hit) => hit.doctype === "topic" && !!hit.url) ?? hits[0] ?? null;

  return topic_hit;
}

async function getIfixitRepairabilityByDeviceUrl(device_path: string): Promise<{
  score: number | null;
  scale: number | null;
  release_year: number | null;
}> {
  const response = await ifixit_limiter(() => fetchWithTimeout(`${IFIXIT_BASE_URL}${device_path}`, {}, 8000));
  if (!response.ok) {
    return { score: null, scale: null, release_year: null };
  }

  const html = await response.text();
  const repairability = getRepairabilityFromHtml(html);
  return { ...repairability, release_year: extractReleaseYearFromIfixitHtml(html) };
}

/** Год выпуска с страницы устройства iFixit (fallback, если справочник не знает модель). */
export function extractReleaseYearFromIfixitHtml(html: string): number | null {
  const patterns = [
    /Released[^0-9]{0,30}(\d{4})/i,
    /Initial release[^0-9]{0,30}(\d{4})/i,
    /Release date[^0-9]{0,30}(\d{4})/i,
    /"releaseDate"\s*:\s*"(\d{4})/i,
    /introduced[^0-9]{0,30}(\d{4})/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const year = Number.parseInt(match[1], 10);
      if (year >= 2007 && year <= new Date().getFullYear() + 1) return year;
    }
  }
  return null;
}

export interface OlxListingPageData {
  post_summary: string;
  seller_name: string | null;
  seller_ads_count: number | null;
  seller_member_since: string | null;
}

function parseSellerFromOlxHtml(html: string): Pick<OlxListingPageData, "seller_name" | "seller_ads_count" | "seller_member_since"> {
  let seller_name: string | null = null;
  let seller_ads_count: number | null = null;
  let seller_member_since: string | null = null;

  const next_data_match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (next_data_match?.[1]) {
    try {
      const next_data = JSON.parse(next_data_match[1]) as {
        props?: { pageProps?: { ad?: { user?: { name?: string; created?: string; adsCount?: number; ads_count?: number } } } };
      };
      const user = next_data.props?.pageProps?.ad?.user;
      if (user?.name) seller_name = decodeHtmlEntities(user.name);
      if (user?.created) seller_member_since = user.created;
      const ads_count = user?.adsCount ?? user?.ads_count;
      if (typeof ads_count === "number" && ads_count >= 0) seller_ads_count = ads_count;
    } catch {
      // fallback ниже
    }
  }

  if (!seller_name) {
    const profile_match = html.match(/data-testid="user-profile-link"[^>]*>([^<]+)</i)
      ?? html.match(/data-testid="seller-name"[^>]*>([^<]+)</i);
    if (profile_match?.[1]) seller_name = decodeHtmlEntities(profile_match[1].trim());
  }

  if (seller_ads_count === null) {
    const ads_match = html.match(/(\d+)\s+ogłosze[nń]/i) ?? html.match(/(\d+)\s+ogloszen/i);
    if (ads_match?.[1]) seller_ads_count = Number.parseInt(ads_match[1], 10);
  }

  if (!seller_member_since) {
    const since_match = html.match(/(?:na OLX od|członek od|member since)[^0-9]{0,20}(\d{4})/i);
    if (since_match?.[1]) seller_member_since = since_match[1];
  }

  return { seller_name, seller_ads_count, seller_member_since };
}

async function getOlxListingPageData(listing_url: string): Promise<OlxListingPageData> {
  const response = await olx_page_limiter(() =>
    fetchWithTimeout(listing_url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      },
    }, 8000),
  );

  if (!response.ok) {
    return { post_summary: "", seller_name: null, seller_ads_count: null, seller_member_since: null };
  }

  const html = await response.text();
  const seller_info = parseSellerFromOlxHtml(html);

  const ld_json_match = html.match(
    /<script[^>]+type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/i,
  );

  if (ld_json_match?.[1]) {
    try {
      const parsed = JSON.parse(ld_json_match[1]) as { description?: string; seller?: { name?: string } };
      if (!seller_info.seller_name && parsed.seller?.name) {
        seller_info.seller_name = decodeHtmlEntities(parsed.seller.name);
      }
      if (typeof parsed.description === "string") {
        return { post_summary: decodeHtmlEntities(parsed.description), ...seller_info };
      }
    } catch {
      // Игнорируем JSON parse ошибки и пробуем meta description.
    }
  }

  const meta_match = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  return {
    post_summary: meta_match?.[1] ? decodeHtmlEntities(meta_match[1]) : "",
    ...seller_info,
  };
}

export interface OlxListingSignals {
  device_query: string;
  damage_types: DamageType[];
  post_summary: string;
  has_box: boolean;
  battery_health_percent: number | null;
  seller_name: string | null;
  seller_ads_count: number | null;
  seller_member_since: string | null;
}

/**
 * "Быстрая" половина анализа — только то, что нужно для запуска поиска
 * запчастей (device_query, damage_types). Не трогает iFixit, поэтому
 * pipeline.ts может запустить поиск iFixit и поиск запчастей ПАРАЛЛЕЛЬНО
 * сразу после этого вызова, а не ждать iFixit впустую перед тем, как вообще
 * начать искать запчасти.
 *
 * Порог АКБ больше не применяется на сервере — только извлекается % из текста.
 */
export async function extractOlxListingSignals(
  listing: ParsedOlxListing,
  battery_threshold_percent?: number | null,
): Promise<OlxListingSignals> {
  const device_query = extractDeviceQueryFromTitle(listing.title);
  const page_data = await getOlxListingPageData(listing.url);
  const full_text = `${listing.title} ${page_data.post_summary}`;
  const damage_types = detectDamageTypes(full_text, battery_threshold_percent);
  const has_box = detectHasBox(full_text);
  const battery_health_percent = extractBatteryHealthPercent(full_text);

  return {
    device_query,
    damage_types,
    post_summary: page_data.post_summary,
    has_box,
    battery_health_percent,
    seller_name: page_data.seller_name,
    seller_ads_count: page_data.seller_ads_count,
    seller_member_since: page_data.seller_member_since,
  };
}

/** "Медленная" половина — поиск устройства и оценки ремонтопригодности на iFixit. */
export async function lookupIfixitDeviceMatch(device_query: string): Promise<IfixitDeviceMatch> {
  const device_hit = device_query ? await searchIfixitDevice(device_query) : null;
  const repairability = device_hit?.url
    ? await getIfixitRepairabilityByDeviceUrl(device_hit.url)
    : { score: null, scale: null, release_year: null };

  return {
    device_name: device_hit?.device ?? device_hit?.title ?? null,
    device_url: device_hit?.url ? `${IFIXIT_BASE_URL}${device_hit.url}` : null,
    repairability_score: repairability.score,
    repairability_scale: repairability.scale,
    release_year: repairability.release_year,
  };
}

export async function analyzeOlxListingWithFixScore(
  listing: ParsedOlxListing,
): Promise<OlxFixAnalysisResult> {
  const signals = await extractOlxListingSignals(listing);
  const device_match = await lookupIfixitDeviceMatch(signals.device_query);

  return {
    listing_id: listing.id,
    listing_title: listing.title,
    listing_url: listing.url,
    device_query: signals.device_query,
    device_match,
    damage_types: signals.damage_types,
    post_summary: signals.post_summary,
  };
}

export async function analyzeOlxListingsWithFixScore(
  listings: ParsedOlxListing[],
): Promise<OlxFixAnalysisResult[]> {
  const repairability_cache = new Map<string, IfixitDeviceMatch>();
  const results: OlxFixAnalysisResult[] = [];

  for (const listing of listings) {
    const analysis = await analyzeOlxListingWithFixScore(listing);

    const cache_key = analysis.device_query;
    if (cache_key && repairability_cache.has(cache_key)) {
      results.push({
        ...analysis,
        device_match: repairability_cache.get(cache_key) ?? analysis.device_match,
      });
      continue;
    }

    if (cache_key) {
      repairability_cache.set(cache_key, analysis.device_match);
    }

    results.push(analysis);
  }

  return results;
}
