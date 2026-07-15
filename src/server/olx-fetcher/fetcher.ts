import { LISTING_QUERY } from "./constants";
import { parseOlxListing } from "./parser";
import type { GraphQlResponse, ListingMetadata, SearchParameter } from "./types";

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

export async function fetchOlxListingsPage({
  offset = 0,
  limit = 40,
  category_id = "1839",
  owner_type = "private",
  state_filter = "damaged",
  query = "",
  sl = "",
  cookie = "",
}: FetchOlxListingsPageOptions = {}): Promise<FetchOlxListingsPageResult> {
  const url = "https://www.olx.pl/apigateway/graphql";

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

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    origin: "https://www.olx.pl",
    referer:
      "https://www.olx.pl/elektronika/telefony/smartfony-telefony-komorkowe/?search%5Bfilter_enum_state%5D%5B0%5D=damaged",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "x-client": "DESKTOP",
  };

  if (cookie) {
    headers.cookie = cookie;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as GraphQlResponse;

  if (data.errors?.length) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }

  const result = data?.data?.clientCompatibleListings;
  if (!result) {
    throw new Error("Пустой ответ clientCompatibleListings");
  }

  if (result.__typename === "ListingError") {
    throw new Error(
      `ListingError: ${result?.error?.code || "unknown"} - ${result?.error?.detail || ""}`,
    );
  }

  const parsed_items = (result.data || []).map(parseOlxListing);

  return {
    items: parsed_items,
    metadata: result.metadata || {},
    next_link: result.links?.next?.href || null,
  };
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
  // Между запросами страниц на OLX могут появляться новые объявления, из-за
  // чего offset-пагинация может сдвинуться и вернуть повторно уже виденный id.
  // Дедупликация по id защищает от дублей в финальном списке.
  const seen_ids = new Set<number>();
  let current_offset = start_offset;

  for (let page_index = 0; page_index < max_pages; page_index += 1) {
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

/**
 * Прогоняет fetchOlxAllListingsPages по нескольким значениям
 * filter_enum_state (например ["damaged", "used"]) и объединяет результат с
 * дедупликацией по id — объявление физически не может быть одновременно в
 * двух состояниях, но дедуп на всякий случай защищает от повторов, если OLX
 * вернёт что-то на границе между категориями.
 */
export async function fetchOlxListingsForStates({
  states,
  ...rest
}: FetchListingsForStatesOptions): Promise<ParsedOlxListing[]> {
  const all_items: ParsedOlxListing[] = [];
  const seen_ids = new Set<number>();

  for (const state_filter of states) {
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