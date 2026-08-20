import type { AllegroPart } from "@/shared/types/domain";
import {
  filterPartsByMedianPrice,
  isPriceRealistic,
  isRelevantProduct,
  mentionsPartKeyword,
} from "@/server/domain/parts-shared";
import { createConcurrencyLimiter, fetchWithTimeout } from "@/server/shared/concurrency-limiter";
import { config } from "@/server/shared/config";

const PARTS_STORE_GRAPHQL = "https://parts-store.pl/graphql/v1/";
const PARTS_STORE_BASE = "https://parts-store.pl";

const FETCH_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  Origin: PARTS_STORE_BASE,
  Referer: `${PARTS_STORE_BASE}/`,
};

// Живой тест (curl POST /graphql/v1/) вернул 200 без challenge/DataDome.
// Публичный endpoint магазина — без auth, limit в searchInput. На всякий
// случай лимитер строже OLX (2 параллельных, пауза между стартами), чтобы
// не спровоцировать rate-limit при полном скане сотен моделей.
const parts_store_limiter = createConcurrencyLimiter(
  config.pipeline.parts_store_concurrency,
  config.pipeline.parts_store_min_interval_ms,
);

const GRAPHQL_QUERY = `query PartsStoreTextSearch($text: String!, $limit: Int!) {
  productsTextSearch(searchInput: { text: $text, limit: $limit }) {
    products {
      name
      link
      iconSmall
      price {
        price {
          gross {
            value
            formatted
          }
        }
      }
    }
  }
}`;

interface PartsStoreGraphqlProduct {
  name: string;
  link: string;
  iconSmall: string | null;
  price?: {
    price?: {
      gross?: {
        value?: number | null;
        formatted?: string | null;
      } | null;
    } | null;
  } | null;
}

interface PartsStoreGraphqlResponse {
  data?: {
    productsTextSearch?: {
      products?: PartsStoreGraphqlProduct[] | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string }>;
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

function normalizeImageUrl(icon_path: string | null | undefined): string | null {
  if (!icon_path) return null;
  if (icon_path.startsWith("http")) return icon_path;
  if (icon_path.startsWith("//")) return `https:${icon_path}`;
  return `${PARTS_STORE_BASE}${icon_path.startsWith("/") ? "" : "/"}${icon_path}`;
}

function normalizeProductUrl(link: string | null | undefined): string | null {
  if (!link) return null;
  if (link.startsWith("http")) return link;
  return `${PARTS_STORE_BASE}${link.startsWith("/") ? "" : "/"}${link}`;
}

export function buildPartsStoreSearchUrl(search_query: string): string {
  return `${PARTS_STORE_BASE}/search.php?text=${encodeURIComponent(search_query)}`;
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
  return { search_query, search_url: buildPartsStoreSearchUrl(search_query) };
}

async function fetchPartsStoreGraphql(search_query: string, signal?: AbortSignal): Promise<PartsStoreGraphqlProduct[]> {
  const response = await parts_store_limiter(() =>
    fetchWithTimeout(
      PARTS_STORE_GRAPHQL,
      {
        method: "POST",
        headers: FETCH_HEADERS,
        body: JSON.stringify({
          query: GRAPHQL_QUERY,
          variables: {
            text: search_query,
            limit: config.pipeline.parts_store_search_limit,
          },
        }),
        signal,
      },
      10_000,
    ),
  );

  if (!response.ok) {
    throw new Error(`Parts-store HTTP ${response.status}`);
  }

  const body = await response.json() as PartsStoreGraphqlResponse;
  if (body.errors?.length) {
    throw new Error(body.errors.map((err) => err.message ?? "GraphQL error").join("; "));
  }

  return body.data?.productsTextSearch?.products ?? [];
}

export interface PartsStorePartsResult {
  parts: AllegroPart[];
  search_url: string;
  source: "parts_store";
}

export async function fetchPartsStoreParts(
  brand: string,
  model_snippet: string,
  damage_type: string,
  part_keyword: string,
  limit = 3,
  signal?: AbortSignal,
): Promise<PartsStorePartsResult> {
  const { search_query, search_url } = buildSearchQuery(brand, model_snippet, part_keyword);

  try {
    const raw_products = await fetchPartsStoreGraphql(search_query, signal);

    const mapped = raw_products
      .map((product) => {
        const price = product.price?.price?.gross?.value ?? null;
        const url = normalizeProductUrl(product.link);
        if (!product.name || price === null || price <= 0 || !url) return null;
        return {
          title: product.name,
          price,
          url,
          image: normalizeImageUrl(product.iconSmall),
        };
      })
      .filter((item): item is { title: string; price: number; url: string; image: string | null } => item !== null);

    const prefiltered = mapped.filter(
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
        source: "parts_store" as const,
      }));

    return { parts: valid_parts, search_url, source: "parts_store" };
  } catch {
    return { parts: [], search_url, source: "parts_store" };
  }
}
