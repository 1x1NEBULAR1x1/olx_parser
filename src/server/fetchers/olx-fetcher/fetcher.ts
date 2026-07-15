import { LISTING_QUERY } from "./constants";
import { parseOlxListing } from "./parser";
import type { GraphQlResponse, ListingMetadata, SearchParameter } from "./types";
import { createConcurrencyLimiter, fetchWithTimeout } from "@/server/shared/concurrency-limiter";
import { config } from "@/server/shared/config";
import { createLogger } from "@/server/shared/logger";

const olx_log = createLogger("olx-listings");

const OLX_GRAPHQL_URL = "https://www.olx.pl/apigateway/graphql";
const OLX_LISTINGS_REFERER =
  "https://www.olx.pl/elektronika/telefony/smartfony-telefony-komorkowe/?search%5Bfilter_enum_state%5D%5B0%5D=damaged";

const RETRY_BACKOFF_MS = [2_000, 5_000, 10_000] as const;

const olx_listings_limiter = createConcurrencyLimiter(
  config.pipeline.olx_listings_concurrency,
  config.pipeline.olx_listings_min_interval_ms,
);

interface FetchOlxListingsPageOptions {
  offset?: number;
  limit?: number;
  category_id?: string;
  owner_type?: string;
  state_filter?: string;
  /** Текстовый поиск (GraphQL key: query) */
  query?: string;
  sl?: string;
  cookie?: string;
}

export interface ParsedOlxListing {
  id: number;
  title: string;
  url: string;
  created_at: string;
  city: string | null;
  region: string | null;
  price_value: number | null;
  price_currency: string | null;
  is_negotiable: boolean | null;
  photos: string[];
}

interface FetchOlxListingsPageResult {
  items: ParsedOlxListing[];
  metadata: ListingMetadata;
  next_link: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOlxStatus(status: number): boolean {
  return status === 403 || status === 429 || status === 502 || status === 503;
}

function buildOlxHttpError(status: number): Error {
  if (status === 403) {
    return new Error(
      "OLX HTTP 403: доступ временно заблокирован. Подождите 2–5 минут и повторите скан.",
    );
  }
  if (status === 429) {
    return new Error("OLX HTTP 429: слишком много запросов. Подождите и повторите скан.");
  }
  return new Error(`OLX HTTP ${status}`);
}

function createSearchParameters(
  options: Required<Pick<FetchOlxListingsPageOptions, "offset" | "limit" | "category_id" | "owner_type" | "state_filter">>
    & Pick<FetchOlxListingsPageOptions, "sl" | "query">,
): SearchParameter[] {
  return [
    { key: "offset", value: String(options.offset) },
    { key: "limit", value: String(options.limit) },
    { key: "category_id", value: options.category_id },
    { key: "owner_type", value: options.owner_type },
    { key: "filter_enum_state[0]", value: options.state_filter },
    { key: "suggest_filters", value: "true" },
    ...(options.query ? [{ key: "query", value: options.query }] : []),
    ...(options.sl ? [{ key: "sl", value: options.sl }] : []),
  ];
}

async function fetchOlxListingsPageOnce({
  offset = 0,
  limit = 40,
  category_id = "1839",
  owner_type = "private",
  state_filter = "damaged",
  query = "",
  sl = "",
  cookie = "",
}: FetchOlxListingsPageOptions = {}): Promise<FetchOlxListingsPageResult> {
  const payload = {
    query: LISTING_QUERY,
    variables: {
      searchParameters: createSearchParameters({
        offset,
        limit,
        category_id,
        owner_type,
        state_filter,
        query,
        sl,
      }),
    },
  };

  const resolved_cookie = cookie || config.pipeline.olx_cookie;
  const headers: Record<string, string> = {
    accept: "application/json",
    "accept-language": "pl-PL,pl;q=0.9,en;q=0.8",
    "content-type": "application/json",
    origin: "https://www.olx.pl",
    referer: OLX_LISTINGS_REFERER,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "x-client": "DESKTOP",
    "x-site-code": "olxpl",
  };

  if (resolved_cookie) {
    headers.cookie = resolved_cookie;
  }

  const response = await fetchWithTimeout(
    OLX_GRAPHQL_URL,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    12_000,
  );

  if (!response.ok) {
    throw buildOlxHttpError(response.status);
  }

  const data = (await response.json()) as GraphQlResponse;

  if (data.errors?.length) {
    throw new Error(`OLX GraphQL error: ${data.errors[0].message}`);
  }

  const result = data?.data?.clientCompatibleListings;
  if (!result) {
    throw new Error("OLX: пустой ответ clientCompatibleListings");
  }

  if (result.__typename === "ListingError") {
    throw new Error(
      `OLX ListingError: ${result?.error?.code || "unknown"} - ${result?.error?.detail || ""}`,
    );
  }

  const parsed_items = (result.data || []).map(parseOlxListing);

  return {
    items: parsed_items,
    metadata: result.metadata || {},
    next_link: result.links?.next?.href || null,
  };
}

export async function fetchOlxListingsPage(
  options: FetchOlxListingsPageOptions = {},
): Promise<FetchOlxListingsPageResult> {
  const max_retries = config.pipeline.olx_listings_retry_count;

  return olx_listings_limiter(async () => {
    let last_error: Error | null = null;

    for (let attempt = 0; attempt <= max_retries; attempt += 1) {
      try {
        return await fetchOlxListingsPageOnce(options);
      } catch (error) {
        last_error = error instanceof Error ? error : new Error(String(error));
        const status_match = last_error.message.match(/OLX HTTP (\d+)/);
        const status = status_match ? Number(status_match[1]) : 0;
        const can_retry = isRetryableOlxStatus(status) && attempt < max_retries;

        if (!can_retry) throw last_error;

        const backoff_ms = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
        olx_log.warn("Повтор запроса OLX после ошибки", {
          attempt: attempt + 1,
          max_retries,
          status,
          backoff_ms,
          state_filter: options.state_filter,
          offset: options.offset,
        });
        await sleep(backoff_ms);
      }
    }

    throw last_error ?? new Error("OLX: неизвестная ошибка запроса");
  });
}

interface FetchAllListingsPagesOptions extends FetchOlxListingsPageOptions {
  max_pages?: number;
  start_offset?: number;
  limit?: number;
}

export async function fetchOlxAllListingsPages({
  max_pages = 10,
  start_offset = 0,
  limit = 40,
  ...rest
}: FetchAllListingsPagesOptions = {}): Promise<ParsedOlxListing[]> {
  const all_items: ParsedOlxListing[] = [];
  const seen_ids = new Set<number>();
  let current_offset = start_offset;

  for (let page_index = 0; page_index < max_pages; page_index += 1) {
    if (page_index > 0) {
      await sleep(config.pipeline.olx_listings_page_delay_ms);
    }

    const page_data = await fetchOlxListingsPage({
      offset: current_offset,
      limit,
      ...rest,
    });

    const page_items = page_data.items || [];
    for (const item of page_items) {
      if (!seen_ids.has(item.id)) {
        seen_ids.add(item.id);
        all_items.push(item);
      }
    }

    if (page_items.length < limit) {
      break;
    }

    current_offset += limit;
  }

  return all_items;
}

interface FetchListingsForStatesOptions extends Omit<FetchAllListingsPagesOptions, "state_filter"> {
  states: string[];
}

export async function fetchOlxListingsForStates({
  states,
  ...rest
}: FetchListingsForStatesOptions): Promise<ParsedOlxListing[]> {
  const all_items: ParsedOlxListing[] = [];
  const seen_ids = new Set<number>();

  for (let state_index = 0; state_index < states.length; state_index += 1) {
    const state_filter = states[state_index];
    if (state_index > 0) {
      await sleep(config.pipeline.olx_listings_state_delay_ms);
    }

    const items = await fetchOlxAllListingsPages({ ...rest, state_filter });
    for (const item of items) {
      if (!seen_ids.has(item.id)) {
        seen_ids.add(item.id);
        all_items.push(item);
      }
    }
  }

  return all_items;
}
