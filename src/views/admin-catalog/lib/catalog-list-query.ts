export const CATALOG_PAGE_SIZE_OPTIONS = [15, 30, 50, 100] as const;

export interface CatalogListQuery {
  page: number;
  page_size: number;
  search: string;
  brand: string;
  model_line: string;
  status: string;
}

export const DEFAULT_CATALOG_LIST_QUERY: CatalogListQuery = {
  page: 1,
  page_size: 30,
  search: "",
  brand: "",
  model_line: "",
  status: "",
};

export function parseCatalogListQuery(params: URLSearchParams): CatalogListQuery {
  const page_size_raw = Number(params.get("limit") ?? params.get("page_size") ?? DEFAULT_CATALOG_LIST_QUERY.page_size);
  const page_size = CATALOG_PAGE_SIZE_OPTIONS.includes(page_size_raw as typeof CATALOG_PAGE_SIZE_OPTIONS[number])
    ? page_size_raw
    : DEFAULT_CATALOG_LIST_QUERY.page_size;
  const page_raw = Number(params.get("page") ?? "1");
  const page = Number.isFinite(page_raw) ? Math.max(1, Math.round(page_raw)) : 1;

  return {
    page,
    page_size,
    search: params.get("search")?.trim() ?? "",
    brand: params.get("brand") ?? "",
    model_line: params.get("model_line") ?? "",
    status: params.get("status") ?? "",
  };
}

export function catalogListSearchParams(query: CatalogListQuery): URLSearchParams {
  const search = new URLSearchParams();
  if (query.page > 1) search.set("page", String(query.page));
  if (query.page_size !== DEFAULT_CATALOG_LIST_QUERY.page_size) {
    search.set("limit", String(query.page_size));
  }
  if (query.search) search.set("search", query.search);
  if (query.brand) search.set("brand", query.brand);
  if (query.model_line) search.set("model_line", query.model_line);
  if (query.status) search.set("status", query.status);
  return search;
}

export function catalogListHref(query: CatalogListQuery): string {
  const qs = catalogListSearchParams(query).toString();
  return qs ? `/admin/catalog?${qs}` : "/admin/catalog";
}

export function catalogDeviceHref(id: number, query: CatalogListQuery): string {
  const qs = catalogListSearchParams(query).toString();
  return qs ? `/admin/catalog/${id}?${qs}` : `/admin/catalog/${id}`;
}

export function catalogListQueryEqual(a: CatalogListQuery, b: CatalogListQuery): boolean {
  return a.page === b.page
    && a.page_size === b.page_size
    && a.search === b.search
    && a.brand === b.brand
    && a.model_line === b.model_line
    && a.status === b.status;
}
