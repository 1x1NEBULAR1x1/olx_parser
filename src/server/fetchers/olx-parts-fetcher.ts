import * as cheerio from "cheerio";
import type { AllegroPart } from "@/shared/types/domain";
import { filterPartsByMedianPrice, isPriceRealistic, isRelevantProduct, mentionsPartKeyword, parsePlnPrice } from "@/server/domain/parts-shared";
import { extractCardImageUrl } from "@/server/fetchers/html-image";
import { createConcurrencyLimiter, fetchWithTimeout } from "@/server/shared/concurrency-limiter";
import { AntibotBlockedError, isAntibotHtml, isAntibotHttpStatus } from "@/server/fetchers/antibot";

// Allegro REST API требует верификации приложения для GET /offers/listing —
// живой тест (client_credentials, свежесозданный Client ID) вернул
// 403 AccessDenied ("Access to this resource is limited and cannot be
// granted" — актуальная политика Allegro на 2026 год, см. issue-трекер
// allegro/allegro-api). Ceneo.pl блокирует scraping анти-бот заглушкой
// (подтверждено ранее, см. TODO.md).
//
// Вместо них используем сам OLX: у него есть отдельная категория "Części do
// telefonów" (запчасти для телефонов, category_id известен из breadcrumb —
// 5268, но проще и надёжнее скрапить обычную HTML-выдачу поиска по этой
// категории, т.к. GraphQL clientCompatibleListings для неё ведёт себя
// нестабильно). HTML-страницы категории отдаются без анти-бот защиты (в
// отличие от Ceneo) — карточки объявлений (`data-cy="l-card"`) рендерятся
// на сервере и доступны обычному fetch().
const OLX_PARTS_CATEGORY_PATH = "https://www.olx.pl/elektronika/telefony/akcesoria/czesci";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// OLX — тот же сайт, что и объявления с телефонами (никакой анти-бот защиты
// там не встречено), поэтому здесь можно себе позволить несколько
// одновременных запросов вместо строгой сериализации по одному.
const olx_limiter = createConcurrencyLimiter(4, 100);

async function throttledFetch(url: string, signal?: AbortSignal): Promise<Response> {
  return olx_limiter(() => fetchWithTimeout(url, { headers: FETCH_HEADERS, signal }, 8000));
}

const POLISH_DIACRITICS: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

function buildSearchSlug(search_query: string): string {
  const transliterated = search_query
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => POLISH_DIACRITICS[ch] ?? ch);

  return transliterated
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function buildOlxPartsSearchUrl(search_query: string): string {
  const slug = buildSearchSlug(search_query);
  return `${OLX_PARTS_CATEGORY_PATH}/q-${slug}/`;
}

interface OlxPartProduct {
  title: string;
  price: number;
  url: string;
  image: string | null;
}

const MULTI_PART_KEYWORDS = [
  "zestaw", "komplet", "kpl", "para", "2 szt", "dwie szt", "dwa szt",
  "zestaw 2", "zestaw 3", "zestaw 4", "zestaw 5",
];

function isSinglePartListing(title: string): boolean {
  const normalized = title.toLowerCase();
  if (MULTI_PART_KEYWORDS.some((keyword) => normalized.includes(keyword))) return false;
  if (/\b([3-9]|\d{2,})\s*(szt\.?|sztuk)\b/.test(normalized)) return false;
  if (/\b(2|dwie|dwa)\s*(szt\.?|sztuk|sztuki)\b/.test(normalized)) return false;
  return true;
}

async function fetchOlxPartsPage(search_query: string, signal?: AbortSignal): Promise<OlxPartProduct[]> {
  const url = buildOlxPartsSearchUrl(search_query);
  const response = await throttledFetch(url, signal);
  if (isAntibotHttpStatus(response.status)) {
    throw new AntibotBlockedError("olx", response.status);
  }
  if (!response.ok) {
    throw new Error(`OLX parts HTTP ${response.status}`);
  }

  const html = await response.text();
  if (isAntibotHtml(html)) {
    throw new AntibotBlockedError("olx", response.status);
  }
  const $ = cheerio.load(html);

  const products: OlxPartProduct[] = [];

  $('[data-cy="l-card"]').each((_, el) => {
    const $el = $(el);

    const title = $el.find("h4").first().text().trim() || $el.find('[data-testid="ad-card-title"]').first().text().trim();
    if (!title) return;

    const price_text = $el.find('[data-testid="ad-price"]').first().text().trim();
    const price = parsePlnPrice(price_text);
    if (!price || price <= 0) return;

    const href = $el.find('a[href^="/d/oferta/"]').first().attr("href");
    if (!href) return;
    const product_url = href.startsWith("http") ? href : `https://www.olx.pl${href}`;

    const image = extractCardImageUrl($el);

    products.push({ title, price, url: product_url, image });
  });

  return products;
}

export interface OlxPartsResult {
  parts: AllegroPart[];
  search_url: string;
  source: "olx";
}

export async function fetchOlxParts(
  brand: string,
  model_snippet: string,
  damage_type: string,
  part_keyword: string,
  limit = 3,
  signal?: AbortSignal,
): Promise<OlxPartsResult> {
  const brand_in_snippet =
    brand !== "unknown" && model_snippet.toLowerCase().includes(brand.toLowerCase());
  const query_parts = [
    !brand_in_snippet && brand !== "unknown" ? brand : "",
    model_snippet,
    part_keyword,
  ].filter(Boolean);
  const search_query = query_parts.join(" ");
  const search_url = buildOlxPartsSearchUrl(search_query);

  try {
    const all_products = await fetchOlxPartsPage(search_query, signal);

    const prefiltered = all_products.filter(
      (p) =>
        isSinglePartListing(p.title) &&
        isRelevantProduct(p.title, brand, model_snippet) &&
        mentionsPartKeyword(p.title, part_keyword) &&
        isPriceRealistic(p.price, damage_type),
    );

    const median_filtered = filterPartsByMedianPrice(prefiltered, damage_type);

    const valid_parts: AllegroPart[] = median_filtered
      .sort((a, b) => a.price - b.price)
      .slice(0, limit)
      .map((p) => ({
        title: p.title,
        price: Math.round(p.price * 100) / 100,
        currency: "PLN",
        url: p.url,
        image: p.image,
        source: "olx" as const,
      }));

    return { parts: valid_parts, search_url, source: "olx" };
  } catch (error) {
    if (error instanceof AntibotBlockedError) throw error;
    return { parts: [], search_url, source: "olx" };
  }
}
