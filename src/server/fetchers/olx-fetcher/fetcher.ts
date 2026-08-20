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
  /** Точечная загрузка одного объявления по id (без category/state фильтров). */
  listing_id?: number;
  sl?: string;
  cookie?: string;
  signal?: AbortSignal;
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
  description?: string;
  seller_name?: string | null;
  seller_member_since?: string | null;
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
    & Pick<FetchOlxListingsPageOptions, "sl" | "query" | "listing_id">,
): SearchParameter[] {
  if (options.listing_id) {
    return [
      { key: "query", value: String(options.listing_id) },
      { key: "limit", value: "1" },
    ];
  }

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
  listing_id,
  sl = "",
  cookie = "",
  signal,
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
        listing_id,
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
      signal,
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

function isRetryableOlxError(error: Error): boolean {
  const status_match = error.message.match(/OLX HTTP (\d+)/);
  const status = status_match ? Number(status_match[1]) : 0;
  if (isRetryableOlxStatus(status)) return true;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  return /timeout|aborted|fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|пустой ответ clientCompatibleListings/i
    .test(`${error.name} ${error.message}`);
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
        if (options.signal?.aborted) throw last_error;
        const can_retry = isRetryableOlxError(last_error) && attempt < max_retries;

        if (!can_retry) throw last_error;

        const backoff_ms = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
        olx_log.warn("Повтор запроса OLX после ошибки", {
          attempt: attempt + 1,
          max_retries,
          reason: last_error.message,
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

/** Описание и продавец одного лота. HTML-страница OLX часто отдаёт 403, GraphQL — нет. */
export async function fetchOlxListingById(
  listing_id: number,
  signal?: AbortSignal,
): Promise<ParsedOlxListing | null> {
  const page = await fetchOlxListingsPage({ listing_id, limit: 1, signal });
  return page.items.find((item) => item.id === listing_id) ?? null;
}

export interface OlxFetchIssue {
  severity: "error" | "warning";
  kind: "olx_page_failed" | "olx_state_failed";
  message: string;
  state_filter?: string;
}

export interface FetchOlxListingsResult {
  items: ParsedOlxListing[];
  issues: OlxFetchIssue[];
  pages_ok: number;
  pages_failed: number;
  states_ok: string[];
  states_failed: string[];
}

interface FetchAllListingsPagesOptions extends FetchOlxListingsPageOptions {
  max_pages?: number;
  start_offset?: number;
  limit?: number;
  on_page?: () => void;
}

export async function fetchOlxAllListingsPages({
  max_pages = 10,
  start_offset = 0,
  limit = 40,
  on_page,
  ...rest
}: FetchAllListingsPagesOptions = {}): Promise<{ items: ParsedOlxListing[]; issues: OlxFetchIssue[] }> {
  const all_items: ParsedOlxListing[] = [];
  const issues: OlxFetchIssue[] = [];
  const seen_ids = new Set<number>();
  let current_offset = start_offset;
  let consecutive_failures = 0;

  for (let page_index = 0; page_index < max_pages; page_index += 1) {
    if (page_index > 0) {
      await sleep(config.pipeline.olx_listings_page_delay_ms);
    }

    try {
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

      consecutive_failures = 0;
      on_page?.();

      if (page_items.length < limit) {
        break;
      }

      current_offset += limit;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      consecutive_failures += 1;
      issues.push({
        severity: "error",
        kind: "olx_page_failed",
        message,
        state_filter: rest.state_filter,
      });
      olx_log.warn("Страница OLX пропущена, идём к следующей", {
        offset: current_offset,
        state_filter: rest.state_filter,
        reason: message,
        kept: all_items.length,
        consecutive_failures,
      });
      current_offset += limit;
      if (consecutive_failures >= 2) break;
    }
  }

  return { items: all_items, issues };
}

interface FetchListingsForStatesOptions extends Omit<FetchAllListingsPagesOptions, "state_filter" | "on_page"> {
  states: string[];
  on_fetch_page?: (pages_done: number, pages_total: number) => void;
}

export async function fetchOlxListingsForStates({
  states,
  on_fetch_page,
  max_pages = 10,
  ...rest
}: FetchListingsForStatesOptions): Promise<FetchOlxListingsResult> {
  const all_items: ParsedOlxListing[] = [];
  const issues: OlxFetchIssue[] = [];
  const seen_ids = new Set<number>();
  const states_ok: string[] = [];
  const states_failed: string[] = [];
  const pages_total = Math.max(1, states.length * max_pages);
  let pages_done = 0;
  let pages_ok = 0;

  for (let state_index = 0; state_index < states.length; state_index += 1) {
    const state_filter = states[state_index];
    if (state_index > 0) {
      await sleep(config.pipeline.olx_listings_state_delay_ms);
    }

    try {
      const page_result = await fetchOlxAllListingsPages({
        ...rest,
        max_pages,
        state_filter,
        on_page: () => {
          pages_done += 1;
          pages_ok += 1;
          on_fetch_page?.(pages_done, pages_total);
        },
      });
      issues.push(...page_result.issues);
      if (page_result.issues.length > 0) {
        states_failed.push(state_filter);
      } else {
        states_ok.push(state_filter);
      }
      for (const item of page_result.items) {
        if (!seen_ids.has(item.id)) {
          seen_ids.add(item.id);
          all_items.push(item);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      states_failed.push(state_filter);
      issues.push({
        severity: "error",
        kind: "olx_state_failed",
        message,
        state_filter,
      });
      olx_log.warn("Состояние OLX пропущено, продолжаем остальные", {
        state_filter,
        reason: message,
        kept: all_items.length,
      });
    }
  }

  return {
    items: all_items,
    issues,
    pages_ok,
    pages_failed: issues.filter((issue) => issue.kind === "olx_page_failed").length,
    states_ok,
    states_failed,
  };
}
