import * as cheerio from "cheerio";
import type { AllegroPart } from "@/shared/types/domain";
import { filterPartsByMedianPrice, isPriceRealistic, isRelevantProduct, parsePlnPrice } from "@/server/domain/parts-shared";
import { createConcurrencyLimiter, fetchWithTimeout } from "@/server/shared/concurrency-limiter";
import { AntibotBlockedError, isAntibotHtml, isAntibotHttpStatus } from "@/server/fetchers/antibot";

const CENEO_BASE = "https://www.ceneo.pl";
const CENEO_SEARCH = `${CENEO_BASE}/szukaj-0020`;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Referer: "https://www.ceneo.pl/",
};

// Ceneo реально банит/показывает анти-бот заглушку при агрессивном опросе,
// поэтому лимитер здесь заметно строже, чем у OLX (максимум 2 одновременных
// запроса, старты не чаще раза в 500ms) — но, в отличие от старой чисто
// последовательной реализации ("жди -> запрос -> жди ответ -> следующий"),
// хотя бы 2 запроса могут быть в полёте одновременно, и таймаут не даёт
// одному подвисшему запросу держать очередь пайплайна.
const ceneo_limiter = createConcurrencyLimiter(2, 500);

async function throttledFetch(url: string, signal?: AbortSignal): Promise<Response> {
  return ceneo_limiter(() => fetchWithTimeout(url, { headers: FETCH_HEADERS, signal }, 8000));
}

function normalizeImageUrl(src: string | undefined): string | null {
  if (!src) return null;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("http")) return src;
  return null;
}

interface CeneoProduct {
  title: string;
  price: number;
  url: string;
  image: string | null;
}

async function fetchCeneoPage(search_query: string, signal?: AbortSignal): Promise<CeneoProduct[]> {
  const encoded = encodeURIComponent(search_query).replace(/%20/g, "+");
  const url = `${CENEO_SEARCH}${encoded};0020.htm`;

  const response = await throttledFetch(url, signal);
  if (isAntibotHttpStatus(response.status)) {
    throw new AntibotBlockedError("ceneo", response.status);
  }
  if (!response.ok) {
    throw new Error(`Ceneo HTTP ${response.status}`);
  }

  const html = await response.text();
  if (isAntibotHtml(html)) {
    throw new AntibotBlockedError("ceneo", response.status);
  }
  const $ = cheerio.load(html);

  const products: CeneoProduct[] = [];

  $(".cat-prod-row").each((_, el) => {
    const $el = $(el);

    // Цена из data-атрибута — самый надёжный источник
    const min_price_raw = $el.attr("data-productminprice");
    const price_num = min_price_raw ? Number.parseFloat(min_price_raw) : null;

    // Если нет в data-атрибуте, пробуем текстовый .price-format
    const price_text = $el.find(".price-format, .box-vert__price").first().text().trim();
    const price_from_text = parsePlnPrice(price_text);

    const price = price_num ?? price_from_text;
    if (!price || price <= 0) return;

    // Название
    const name_from_attr = $el.attr("data-productname");
    const name_from_strong = $el.find("strong").first().text().trim();
    const title = (name_from_attr ?? name_from_strong).trim();
    if (!title) return;

    // Ссылка
    const pid = $el.attr("data-pid");
    const href = $el.find("a.js_click_product, a[href^='/']").first().attr("href");
    const product_url = pid
      ? `${CENEO_BASE}/${pid}`
      : href
      ? `${CENEO_BASE}${href}`
      : null;
    if (!product_url) return;

    // Изображение
    const img_src =
      $el.find("img").first().attr("src") ??
      $el.find("img").first().attr("data-src") ??
      $el.find("img").first().attr("data-lazy-src");
    const image = normalizeImageUrl(img_src);

    products.push({ title, price, url: product_url, image });
  });

  return products;
}

export interface CeneoPartResult {
  parts: AllegroPart[];
  search_url: string;
  source: "ceneo";
}

export async function fetchCeneoParts(
  brand: string,
  model_snippet: string,
  damage_type: string,
  part_keyword: string,
  limit = 3,
  signal?: AbortSignal,
): Promise<CeneoPartResult> {
  // Избегаем дублирования бренда если он уже входит в model_snippet
  const brand_in_snippet =
    brand !== "unknown" &&
    model_snippet.toLowerCase().includes(brand.toLowerCase());
  const query_parts = [
    !brand_in_snippet && brand !== "unknown" ? brand : "",
    model_snippet,
    part_keyword,
  ].filter(Boolean);
  const search_query = query_parts.join(" ");
  const search_url = `${CENEO_SEARCH}${encodeURIComponent(search_query).replace(/%20/g, "+")};0020.htm`;

  try {
    const all_products = await fetchCeneoPage(search_query, signal);

    const prefiltered = all_products.filter(
      (p) =>
        isRelevantProduct(p.title, brand, model_snippet) &&
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
      }));

    return { parts: valid_parts, search_url, source: "ceneo" };
  } catch (error) {
    if (error instanceof AntibotBlockedError) throw error;
    return { parts: [], search_url, source: "ceneo" };
  }
}
