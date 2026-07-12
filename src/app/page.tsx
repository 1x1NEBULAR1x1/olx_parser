"use client";

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Loader2, Search, SlidersHorizontal, Smartphone, X,
} from "lucide-react";
import { DeviceCard } from "@/components/DeviceCard/DeviceCard";
import { FilterBar } from "@/components/FilterBar/FilterBar";
import { ScanBanner } from "@/components/ScanBanner/ScanBanner";
import { HeaderActions } from "@/components/HeaderActions/HeaderActions";
import { Pagination } from "@/components/Pagination/Pagination";
import { useTranslations } from "next-intl";
import { useFiltersStore } from "@/store/filters-store";
import { useScrollStore, PAGE_SIZE_OPTIONS, hasFeedScrollStoreHydrated, onFeedScrollStoreHydrated } from "@/store/scroll-store";
import { getModelLineSortKey } from "@/server/model-line-extractor";
import { useDevicesFeed } from "@/hooks/useDevicesFeed";
import { compareRecommendedRepair } from "@/lib/recommendedRepairScore";
import type { AnalyzedDevice } from "@/lib/api";
import type { FilterValues } from "@/components/FilterBar/FilterBar";

type SortKey =
  | "recommended_repair"
  | "profitability_desc"
  | "profitability_asc"
  | "price_asc"
  | "price_desc"
  | "repairability_desc"
  | "liquidity_desc"
  | "newest"
  | "release_year_desc"
  | "model_line";

function sortDevices(devices: AnalyzedDevice[], sort: SortKey): AnalyzedDevice[] {
  return [...devices].sort((a, b) => {
    switch (sort) {
      case "recommended_repair": return compareRecommendedRepair(a, b);
      case "profitability_asc": return (a.profitability_pct ?? 999) - (b.profitability_pct ?? 999);
      case "price_asc": return (a.price_buy ?? 999999) - (b.price_buy ?? 999999);
      case "price_desc": return (b.price_buy ?? 0) - (a.price_buy ?? 0);
      case "repairability_desc": return (b.repairability_score ?? 0) - (a.repairability_score ?? 0);
      case "liquidity_desc": return (b.liquidity_score ?? 0) - (a.liquidity_score ?? 0);
      case "newest": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "release_year_desc": return (b.release_year ?? 0) - (a.release_year ?? 0);
      case "model_line": {
        const brand_cmp = a.brand.localeCompare(b.brand);
        if (brand_cmp !== 0) return brand_cmp;
        const line_cmp = getModelLineSortKey(a.model_line) - getModelLineSortKey(b.model_line);
        if (line_cmp !== 0) return line_cmp;
        return (a.model_label || a.model_key).localeCompare(b.model_label || b.model_key);
      }
      default: return 0;
    }
  });
}

function filterDevices(devices: AnalyzedDevice[], filters: FilterValues): AnalyzedDevice[] {
  return devices.filter((d) => {
    if (filters.brands.length > 0 && !filters.brands.includes(d.brand)) return false;
    if (filters.models.length > 0 && !filters.models.includes(d.model_key)) return false;
    if (filters.model_lines.length > 0 && !filters.model_lines.includes(d.model_line)) return false;
    if (filters.damage_types.length > 0 && !filters.damage_types.some((dt) => d.damage_types.includes(dt))) return false;
    if (filters.regions.length > 0 && (!d.region || !filters.regions.includes(d.region))) return false;

    if (filters.price_range) {
      const [min, max] = filters.price_range;
      if ((d.price_buy ?? 0) < min || (d.price_buy ?? 0) > max) return false;
    }

    if (filters.min_repairability) {
      const score = d.repairability_score !== null && d.repairability_scale
        ? (d.repairability_score / d.repairability_scale) * 10
        : null;
      if (score === null || score < Number(filters.min_repairability)) return false;
    }

    if (filters.profitability_range) {
      const [min, max] = filters.profitability_range;
      if ((d.profitability_pct ?? -999) < min || (d.profitability_pct ?? 999) > max) return false;
    }

    if (filters.liquidity_range) {
      const [min, max] = filters.liquidity_range;
      if ((d.liquidity_score ?? -1) < min || (d.liquidity_score ?? 999) > max) return false;
    }

    if (filters.min_release_year !== null) {
      if (d.release_year === null || d.release_year < filters.min_release_year) return false;
    }

    return true;
  });
}

export default function HomePage() {
  const t = useTranslations("sort");
  const ts = useTranslations("scan");
  const tf = useTranslations("filters");
  const t_app = useTranslations("app");
  const filters = useFiltersStore((state) => state.filters);
  const set_filters = useFiltersStore((state) => state.set_filters);
  const feed_scroll_y = useScrollStore((state) => state.feed_scroll_y);
  const saved_page = useScrollStore((state) => state.saved_page);
  const saved_loaded_count = useScrollStore((state) => state.saved_loaded_count);
  const page_size = useScrollStore((state) => state.page_size);
  const set_page_size = useScrollStore((state) => state.set_page_size);
  const set_feed_scroll = useScrollStore((state) => state.set_feed_scroll);
  const clear_feed_scroll = useScrollStore((state) => state.clear_feed_scroll);

  const {
    devices,
    filter_meta,
    scan_meta,
    total_count,
    loaded_count,
    initial_loading,
    loading_more,
    reload,
  } = useDevicesFeed();

  const [sort, set_sort] = useState<SortKey>("recommended_repair");
  const [is_filters_open, set_is_filters_open] = useState(false);
  const [page, set_page] = useState(1);
  const [scroll_hydrated, set_scroll_hydrated] = useState(hasFeedScrollStoreHydrated);
  const [scroll_restored, set_scroll_restored] = useState(false);
  const is_first_filter_render = useRef(true);
  const pathname = usePathname();
  const prev_pathname_ref = useRef(pathname);
  const pending_scroll_restore_ref = useRef(false);

  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => onFeedScrollStoreHydrated(() => set_scroll_hydrated(true)), []);

  useEffect(() => {
    if (!scroll_hydrated || feed_scroll_y <= 0) return;
    pending_scroll_restore_ref.current = true;
    if (page !== saved_page) {
      set_page(saved_page);
    }
  }, [scroll_hydrated, feed_scroll_y, saved_page, page]);

  const brand_tree = filter_meta?.brand_tree ?? [];
  const models_by_brand = filter_meta?.models_by_brand ?? {};
  const model_lines_by_brand = filter_meta?.model_lines_by_brand ?? {};
  const damage_type_counts = filter_meta?.damage_type_counts ?? {};
  const region_options = filter_meta?.region_options ?? [];
  const price_bounds = filter_meta?.price_bounds ?? [0, 5000];
  const profitability_bounds = filter_meta?.profitability_bounds ?? [-100, 150];
  const liquidity_bounds: [number, number] = [0, 100];
  const year_bounds = filter_meta?.year_bounds ?? [2014, new Date().getFullYear()];

  const filtered_sorted = useMemo(() => {
    const filtered = filterDevices(devices, filters);
    return sortDevices(filtered, sort);
  }, [devices, filters, sort]);

  const total_pages = Math.max(1, Math.ceil(filtered_sorted.length / page_size));
  const current_page = Math.min(page, total_pages);
  const paginated_devices = useMemo(
    () => filtered_sorted.slice((current_page - 1) * page_size, current_page * page_size),
    [filtered_sorted, current_page, page_size],
  );

  useEffect(() => {
    if (is_first_filter_render.current) {
      is_first_filter_render.current = false;
      return;
    }
    set_page(1);
    clear_feed_scroll();
  }, [filters, sort, page_size, clear_feed_scroll]);

  useLayoutEffect(() => {
    if (!pending_scroll_restore_ref.current || scroll_restored) return;
    if (!scroll_hydrated || initial_loading || feed_scroll_y <= 0) return;
    if (page !== saved_page) return;

    const needs_more_data = saved_loaded_count > 0 && loaded_count < saved_loaded_count;
    if (needs_more_data && loading_more) return;

    const max_scroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (feed_scroll_y > max_scroll + 8 && loading_more) return;

    window.scrollTo({ top: feed_scroll_y, left: 0, behavior: "instant" });

    const applied = Math.abs(window.scrollY - feed_scroll_y) <= 48
      || feed_scroll_y <= max_scroll + 8;
    if (!applied && loading_more) return;

    pending_scroll_restore_ref.current = false;
    set_scroll_restored(true);
    clear_feed_scroll();
  }, [
    scroll_hydrated,
    initial_loading,
    scroll_restored,
    feed_scroll_y,
    saved_page,
    saved_loaded_count,
    page,
    loaded_count,
    loading_more,
    clear_feed_scroll,
  ]);

  function handlePageSizeChange(next_page_size: number) {
    set_page_size(next_page_size);
    set_page(1);
    clear_feed_scroll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePageChange(next_page: number) {
    set_page(next_page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveFeedScrollPosition() {
    set_feed_scroll(window.scrollY, current_page, loaded_count);
    pending_scroll_restore_ref.current = true;
  }

  function handleDeviceNavigate() {
    saveFeedScrollPosition();
  }

  useEffect(() => {
    const prev_pathname = prev_pathname_ref.current;
    if (prev_pathname === "/" && pathname.startsWith("/devices/")) {
      set_feed_scroll(window.scrollY, current_page, loaded_count);
      pending_scroll_restore_ref.current = true;
    }
    prev_pathname_ref.current = pathname;
  }, [pathname, current_page, loaded_count, set_feed_scroll]);

  function handleFiltersChange(next_filters: FilterValues) {
    set_filters(next_filters);
  }

  const SORT_OPTIONS: SortKey[] = [
    "recommended_repair",
    "profitability_desc", "profitability_asc",
    "price_asc", "price_desc",
    "repairability_desc", "liquidity_desc", "newest", "release_year_desc", "model_line",
  ];

  const show_chunk_progress = !initial_loading && loaded_count < total_count;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg md:text-xl font-black app-text tracking-tight flex items-center gap-2 min-w-0">
              <Smartphone size={20} className="app-accent shrink-0 sm:hidden" aria-hidden />
              <Smartphone size={22} className="app-accent shrink-0 hidden sm:block" aria-hidden />
              <span className="truncate">SmartFlip</span>
            </h1>
            <p className="hidden sm:block text-[11px] sm:text-xs app-text-muted">{t_app("tagline")}</p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end shrink-0">
            <button
              type="button"
              className="lg:hidden app-btn-ghost text-xs sm:text-sm px-2 sm:px-3"
              onClick={() => set_is_filters_open(true)}
            >
              <SlidersHorizontal size={16} aria-hidden />
              {tf("title")}
            </button>

            <HeaderActions />
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {(!initial_loading || scan_meta !== null) && (
          <div className="mb-6">
            <ScanBanner
              is_scanning={scan_meta?.is_scanning ?? false}
              cached_at={scan_meta?.cached_at ?? null}
              devices_count={scan_meta?.total_count ?? total_count}
              stage={scan_meta?.stage ?? null}
              total_listings={scan_meta?.total_listings ?? null}
              processed_listings={scan_meta?.processed_listings ?? 0}
              percent={scan_meta?.percent ?? 0}
              onScanStarted={reload}
            />
          </div>
        )}

        <div className="flex gap-6">
          <div className="w-72 flex-shrink-0 hidden lg:block">
            <FilterBar
              filters={filters}
              onChange={handleFiltersChange}
              brand_tree={brand_tree}
              models_by_brand={models_by_brand}
              model_lines_by_brand={model_lines_by_brand}
              damage_type_counts={damage_type_counts}
              region_options={region_options}
              price_bounds={price_bounds}
              profitability_bounds={profitability_bounds}
              liquidity_bounds={liquidity_bounds}
              year_bounds={year_bounds}
            />
          </div>

          {is_filters_open && (
            <div className="fixed inset-0 z-40 app-shell overflow-y-auto lg:hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] sticky top-0 app-header">
                <span className="text-sm font-bold app-text">{tf("title")}</span>
                <button
                  type="button"
                  className="app-text-muted p-2"
                  onClick={() => set_is_filters_open(false)}
                  aria-label="close"
                >
                  <X size={22} aria-hidden />
                </button>
              </div>
              <div className="p-4">
                <FilterBar
                  filters={filters}
                  onChange={handleFiltersChange}
                  brand_tree={brand_tree}
                  models_by_brand={models_by_brand}
                  model_lines_by_brand={model_lines_by_brand}
                  damage_type_counts={damage_type_counts}
                  region_options={region_options}
                  price_bounds={price_bounds}
                  profitability_bounds={profitability_bounds}
                  liquidity_bounds={liquidity_bounds}
                  year_bounds={year_bounds}
                />
              </div>
            </div>
          )}

          <main className="flex-1 min-w-0">
            {initial_loading ? (
              <div className="flex items-center justify-center py-24 app-text-faint">
                <Loader2 size={36} className="mr-3 animate-spin" aria-hidden />
                <span className="text-lg">{ts("in_progress")}</span>
              </div>
            ) : filtered_sorted.length === 0 ? (
              <div className="text-center py-24 app-text-faint">
                <Search size={48} className="mx-auto mb-4 opacity-60" aria-hidden />
                <p className="text-lg">{ts("no_devices")}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-xs app-text-faint">
                      {tf("results_count", { count: filtered_sorted.length })}
                    </p>
                    {show_chunk_progress && (
                      <p className="text-[11px] app-text-faint flex items-center gap-1.5">
                        {loading_more && <Loader2 size={12} className="animate-spin" aria-hidden />}
                        {ts("loaded_of", { loaded: loaded_count, total: total_count })}
                      </p>
                    )}
                  </div>

                  <div
                    className="flex flex-col gap-2 w-full min-w-0 sm:w-auto sm:items-end"
                    data-testid="feed-toolbar"
                  >
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="text-xs app-text-muted shrink-0">{t("label")}</span>
                      <select
                        className="app-select flex-1 min-w-0 sm:flex-none sm:max-w-[220px]"
                        value={sort}
                        onChange={(e) => set_sort(e.target.value as SortKey)}
                      >
                        {SORT_OPTIONS.map((key) => (
                          <option key={key} value={key}>{t(key)}</option>
                        ))}
                      </select>
                    </div>

                    <Pagination
                      current_page={current_page}
                      total_pages={total_pages}
                      page_size={page_size}
                      page_size_options={PAGE_SIZE_OPTIONS}
                      onChange={handlePageChange}
                      onPageSizeChange={handlePageSizeChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                  {paginated_devices.map((device) => (
                    <DeviceCard key={device.id} device={device} onNavigate={handleDeviceNavigate} onListingChange={reload} />
                  ))}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
