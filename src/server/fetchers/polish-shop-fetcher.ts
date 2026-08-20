import * as cheerio from "cheerio";
import type { AllegroPart } from "@/shared/types/domain";
import {
  filterPartsByMedianPrice,
  isPriceRealistic,
  isRelevantProduct,
  mentionsPartKeyword,
  parsePlnPrice,
} from "@/server/domain/parts-shared";
import { extractCardImageUrl } from "@/server/fetchers/html-image";
import { createConcurrencyLimiter, fetchWithTimeout } from "@/server/shared/concurrency-limiter";
import { normalizeExternalImageUrl } from "@/shared/lib/external-image";
import { AntibotBlockedError, isAntibotHtml, isAntibotHttpStatus } from "@/server/fetchers/antibot";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const shop_limiter = createConcurrencyLimiter(2, 450);

export const POLISH_PARTS_SHOP_HOSTS = [
  "mobilepart.pl",
  "m9parts.pl",
] as const;

interface ShopProduct {
  title: string;
  price: number;
  url: string;
  image: string | null;
}

interface ShopConfig {
  host: string;
  buildSearchUrl: (query: string) => string;
  parse: ($: cheerio.CheerioAPI) => ShopProduct[];
}

function parsePrestashopCards($: cheerio.CheerioAPI, host: string): ShopProduct[] {
  const products: ShopProduct[] = [];
  $("article.product-miniature, .js-product-miniature").each((_, el) => {
    const $el = $(el);
    const title =
      $el.find(".product-miniature__title a").first().text().trim()
      || $el.find(".product-title a, .product-miniature__title").first().text().trim();
    const href =
      $el.find("a.product-miniature__thumb-link").first().attr("href")
      || $el.find(".product-miniature__title a").first().attr("href")
      || $el.find("a[href]").first().attr("href");
    const price = parsePlnPrice($el.find("span.price, .product-price-and-shipping .price").first().text());
    if (!title || !href || !price) return;
    const url = href.startsWith("http") ? href : `https://${host}${href.startsWith("/") ? "" : "/"}${href}`;
    products.push({
      title,
      price,
      url,
      image: extractCardImageUrl($el),
    });
  });
  return products;
}

function parseWoocommerceCards($: cheerio.CheerioAPI): ShopProduct[] {
  const products: ShopProduct[] = [];
  $(".type-product, li.product").each((_, el) => {
    const $el = $(el);
    const $link = $el.find("h2 a, .woocommerce-loop-product__title a, .product__title a").first();
    const title = $link.text().trim() || $el.find("h2, .woocommerce-loop-product__title").first().text().trim();
    const href = $link.attr("href") || $el.find("a[href*='/produkt/'], a[href*='/product/']").first().attr("href");
    const price = parsePlnPrice(
      $el.find(".price .woocommerce-Price-amount, .woocommerce-Price-amount").first().text(),
    );
    if (!title || !href || !price) return;
    const image = extractCardImageUrl($el);
    products.push({
      title,
      price,
      url: href,
      image: normalizeExternalImageUrl(image),
    });
  });
  return products;
}

const SHOP_CONFIGS: ShopConfig[] = [
  {
    host: "mobilepart.pl",
    buildSearchUrl: (query) => `https://mobilepart.pl/pl/szukaj?s=${encodeURIComponent(query)}`,
    parse: ($) => parsePrestashopCards($, "mobilepart.pl"),
  },
  {
    host: "m9parts.pl",
    buildSearchUrl: (query) => `https://m9parts.pl/?s=${encodeURIComponent(query)}&post_type=product`,
    parse: parseWoocommerceCards,
  },
];

async function fetchShopPage(shop: ShopConfig, search_query: string, signal?: AbortSignal): Promise<ShopProduct[]> {
  const url = shop.buildSearchUrl(search_query);
  const response = await shop_limiter(() =>
    fetchWithTimeout(url, { headers: { ...FETCH_HEADERS, Referer: `https://${shop.host}/` }, signal }, 10_000),
  );
  if (isAntibotHttpStatus(response.status)) {
    throw new AntibotBlockedError("shop", response.status);
  }
  if (!response.ok) return [];
  const html = await response.text();
  if (isAntibotHtml(html)) {
    throw new AntibotBlockedError("shop", response.status);
  }
  if (!html || html.length < 400) return [];
  return shop.parse(cheerio.load(html));
}

function buildSearchQuery(brand: string, model_snippet: string, part_keyword: string): string {
  const brand_in_snippet =
    brand !== "unknown" && model_snippet.toLowerCase().includes(brand.toLowerCase());
  return [
    !brand_in_snippet && brand !== "unknown" ? brand : "",
    model_snippet,
    part_keyword,
  ].filter(Boolean).join(" ");
}

export interface PolishShopPartsResult {
  parts: AllegroPart[];
  search_url: string;
  source: "shop";
}

export async function fetchPolishShopParts(
  brand: string,
  model_snippet: string,
  damage_type: string,
  part_keyword: string,
  limit = 4,
  signal?: AbortSignal,
): Promise<PolishShopPartsResult> {
  const search_query = buildSearchQuery(brand, model_snippet, part_keyword);
  const search_url = SHOP_CONFIGS[0]?.buildSearchUrl(search_query) ?? "";

  try {
    let antibot_error: AntibotBlockedError | null = null;
    const pages = await Promise.all(
      SHOP_CONFIGS.map(async (shop) => {
        try {
          return await fetchShopPage(shop, search_query, signal);
        } catch (error) {
          if (error instanceof AntibotBlockedError) {
            antibot_error = error;
            return [] as ShopProduct[];
          }
          return [] as ShopProduct[];
        }
      }),
    );

    const mapped = pages.flat().filter((product) =>
      isRelevantProduct(product.title, brand, model_snippet)
      && mentionsPartKeyword(product.title, part_keyword)
      && isPriceRealistic(product.price, damage_type),
    );

    if (mapped.length === 0 && antibot_error) throw antibot_error;

    const median_filtered = filterPartsByMedianPrice(mapped, damage_type);
    const parts: AllegroPart[] = median_filtered
      .sort((a, b) => a.price - b.price)
      .slice(0, limit)
      .map((product) => ({
        title: product.title,
        price: Math.round(product.price * 100) / 100,
        currency: "PLN",
        url: product.url,
        image: product.image,
        source: "shop" as const,
      }));

    return { parts, search_url, source: "shop" };
  } catch (error) {
    if (error instanceof AntibotBlockedError) throw error;
    return { parts: [], search_url, source: "shop" };
  }
}
