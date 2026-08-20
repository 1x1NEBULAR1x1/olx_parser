import type { AllegroPart } from "@/shared/types/domain";
import {
  filterPartsByMedianPrice,
  isPriceRealistic,
  isRelevantProduct,
  mentionsPartKeyword,
  parsePlnPrice,
} from "@/server/domain/parts-shared";
import { createConcurrencyLimiter, fetchWithTimeout } from "@/server/shared/concurrency-limiter";
import { isAllegroApiConfigured, searchAllegroOffersListing } from "@/server/fetchers/allegro-api-client";
import { createLogger } from "@/server/shared/logger";
import { AntibotBlockedError, isAntibotHtml, isAntibotHttpStatus } from "@/server/fetchers/antibot";

const allegro_log = createLogger("allegro-parts");

/** Категория Allegro: części do telefonów */
const ALLEGRO_PHONE_PARTS_CATEGORY_ID = 122938;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const allegro_limiter = createConcurrencyLimiter(2, 400);

interface AllegroListingProduct {
  title: string;
  price: number;
  url: string;
  image: string | null;
}

export function buildAllegroPartsSearchUrl(search_query: string): string {
  return `https://allegro.pl/listing?string=${encodeURIComponent(search_query)}&category=${ALLEGRO_PHONE_PARTS_CATEGORY_ID}`;
}

/**
 * Парсит встроенный JSON `__listing_StoreState` из HTML страницы поиска Allegro.
 * Работает, когда страница отдана без DataDome-captcha.
 */
export function parseAllegroListingHtml(html: string): AllegroListingProduct[] {
  if (html.includes("captcha-delivery.com")) return [];

  const script_matches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const products: AllegroListingProduct[] = [];

  for (const script_tag of script_matches) {
    if (!script_tag.includes("__listing_StoreState")) continue;

    const inner = script_tag
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(inner) as {
        __listing_StoreState?: {
          items?: { elements?: Array<Record<string, unknown>> };
        };
      };
      const elements = parsed.__listing_StoreState?.items?.elements ?? [];
      for (const item of elements) {
        if (item.context === "PROMOTED") continue;
        const title = String(item.alt ?? item.title ?? "").trim();
        if (!title) continue;

        const price_block = item.price as { mainPrice?: { amount?: string; currency?: string } } | undefined;
        const price_raw = price_block?.mainPrice?.amount;
        const price = price_raw ? parsePlnPrice(String(price_raw)) : null;
        if (!price || price <= 0) continue;

        const event_data = item.eventData as { offer_id?: string } | undefined;
        const offer_id = event_data?.offer_id;
        const url = offer_id ? `https://allegro.pl/oferta/${offer_id}` : buildAllegroPartsSearchUrl(title);

        const image = typeof item.mainThumbnail === "string" ? item.mainThumbnail : null;
        products.push({ title, price, url, image });
      }
    } catch {
      // ignore malformed script blocks
    }
  }

  return products;
}

async function fetchAllegroListingHtml(
  search_query: string,
  signal?: AbortSignal,
): Promise<{ html: string | null; blocked: boolean; status: number | null }> {
  const url = buildAllegroPartsSearchUrl(search_query);
  const response = await allegro_limiter(() =>
    fetchWithTimeout(url, { headers: FETCH_HEADERS, signal }, 12_000),
  );
  if (isAntibotHttpStatus(response.status)) {
    return { html: null, blocked: true, status: response.status };
  }
  if (!response.ok) return { html: null, blocked: false, status: response.status };
  const html = await response.text();
  if (isAntibotHtml(html) || html.includes("captcha-delivery.com")) {
    return { html: null, blocked: true, status: response.status };
  }
  return { html, blocked: false, status: response.status };
}

async function fetchAllegroPartsViaScrapfly(search_query: string): Promise<AllegroListingProduct[]> {
  const api_key = process.env.SCRAPFLY_API_KEY?.trim();
  if (!api_key) return [];

  const target_url = buildAllegroPartsSearchUrl(search_query);
  const scrapfly_url = new URL("https://api.scrapfly.io/scrape");
  scrapfly_url.searchParams.set("key", api_key);
  scrapfly_url.searchParams.set("url", target_url);
  scrapfly_url.searchParams.set("asp", "true");
  scrapfly_url.searchParams.set("country", "pl");
  scrapfly_url.searchParams.set("render_js", "true");

  try {
    const response = await fetch(scrapfly_url);
    if (!response.ok) return [];
    const payload = (await response.json()) as { result?: { content?: string } };
    const html = payload.result?.content;
    if (!html) return [];
    return parseAllegroListingHtml(html);
  } catch {
    return [];
  }
}

function mapApiOffersToProducts(
  offers: Array<{
    id: string;
    name: string;
    selling_mode?: { price?: { amount?: string; currency?: string } };
    images?: Array<{ url?: string }>;
  }>,
): AllegroListingProduct[] {
  return offers.map((offer) => ({
    title: offer.name,
    price: parsePlnPrice(offer.selling_mode?.price?.amount ?? "") ?? 0,
    url: `https://allegro.pl/oferta/${offer.id}`,
    image: offer.images?.[0]?.url ?? null,
  })).filter((item) => item.price > 0);
}

function buildSearchQuery(
  brand: string,
  model_snippet: string,
  part_keyword: string,
): { search_query: string; search_url: string } {
  const brand_in_snippet =
    brand !== "unknown" && model_snippet.toLowerCase().includes(brand.toLowerCase());
  const query_parts = [
    !brand_in_snippet && brand !== "unknown" ? brand : "",
    model_snippet,
    part_keyword,
  ].filter(Boolean);
  const search_query = query_parts.join(" ");
  return { search_query, search_url: buildAllegroPartsSearchUrl(search_query) };
}

export interface AllegroPartsResult {
  parts: AllegroPart[];
  search_url: string;
  source: "allegro_api" | "allegro_html" | "allegro_scrapfly";
}

export async function fetchAllegroParts(
  brand: string,
  model_snippet: string,
  damage_type: string,
  part_keyword: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<AllegroPartsResult> {
  const { search_query, search_url } = buildSearchQuery(brand, model_snippet, part_keyword);

  try {
    const to_valid_parts = (products: AllegroListingProduct[]): AllegroPart[] => {
    const prefiltered = products.filter(
      (product) =>
        isRelevantProduct(product.title, brand, model_snippet) &&
        mentionsPartKeyword(product.title, part_keyword) &&
        isPriceRealistic(product.price, damage_type),
    );
    const median_filtered = filterPartsByMedianPrice(prefiltered, damage_type);
    return median_filtered
      .sort((a, b) => a.price - b.price)
      .slice(0, limit)
      .map((product) => ({
        title: product.title,
        price: Math.round(product.price * 100) / 100,
        currency: "PLN",
        url: product.url,
        image: product.image,
      }));
  };

  if (isAllegroApiConfigured()) {
    const api_result = await searchAllegroOffersListing(search_query, {
      category_id: ALLEGRO_PHONE_PARTS_CATEGORY_ID,
      limit: Math.max(limit * 3, 15),
    });
    if (api_result && api_result.offers.length > 0) {
      const parts = to_valid_parts(mapApiOffersToProducts(api_result.offers));
      if (parts.length > 0) {
        return { parts, search_url: api_result.search_url, source: "allegro_api" };
      }
    }
  }

  const html_result = await fetchAllegroListingHtml(search_query, signal);
  if (html_result.html) {
    const parts = to_valid_parts(parseAllegroListingHtml(html_result.html));
    if (parts.length > 0) {
      allegro_log.debug("HTML listing parsed", { query: search_query, count: parts.length });
      return { parts, search_url, source: "allegro_html" };
    }
  }

  const scrapfly_products = await fetchAllegroPartsViaScrapfly(search_query);
  const scrapfly_parts = to_valid_parts(scrapfly_products);
  if (scrapfly_parts.length > 0) {
    return { parts: scrapfly_parts, search_url, source: "allegro_scrapfly" };
  }

  if (html_result.blocked) {
    throw new AntibotBlockedError("allegro", html_result.status ?? undefined);
  }

  return { parts: [], search_url, source: "allegro_html" };
  } catch (error) {
    if (error instanceof AntibotBlockedError) throw error;
    return { parts: [], search_url, source: "allegro_html" };
  }
}
