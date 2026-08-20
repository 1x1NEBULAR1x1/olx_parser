"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { useMediaQuery, useTheme } from "@mui/material";
import type { DeviceSortKey } from "@/features/device-filter/lib/sort-and-filter";
import type { FilterValues } from "@/features/device-filter/model/filter-values";
import { useFiltersStore } from "@/features/device-filter/model/filters-store";
import {
  useScrollStore,
  hasFeedScrollStoreHydrated,
  onFeedScrollStoreHydrated,
} from "@/features/feed-scroll/model/scroll-store";
import { useDevicesFeed } from "@/features/scan-control/lib/useDevicesFeed";
import { appendDeviceFeedQuery, parseDeviceFeedPageQuery } from "@/shared/lib/device-feed-query";
import type { DevicesListResponse } from "@/shared/types/api-contracts";

export function useHomePage(initial_feed?: DevicesListResponse | null) {
  const theme = useTheme();
  const is_desktop = useMediaQuery(theme.breakpoints.up("lg"));
  const filters = useFiltersStore((state) => state.filters);
  const set_filters = useFiltersStore((state) => state.set_filters);
  const feed_scroll_y = useScrollStore((state) => state.feed_scroll_y);
  const saved_page = useScrollStore((state) => state.saved_page);
  const page_size = useScrollStore((state) => state.page_size);
  const set_page_size = useScrollStore((state) => state.set_page_size);
  const set_feed_scroll = useScrollStore((state) => state.set_feed_scroll);
  const clear_feed_scroll = useScrollStore((state) => state.clear_feed_scroll);

  const [sort, set_sort] = useState<DeviceSortKey>("recommended_repair");
  const [is_filters_open, set_is_filters_open] = useState(false);
  const [page, set_page] = useState(1);
  const [scroll_hydrated, set_scroll_hydrated] = useState(false);
  const [scroll_restored, set_scroll_restored] = useState(false);
  const [is_pending, startTransition] = useTransition();
  const is_first_filter_render = useRef(true);
  const url_hydrated_ref = useRef(false);
  const pathname = usePathname() ?? "";
  const prev_pathname_ref = useRef(pathname);
  const pending_scroll_restore_ref = useRef(false);

  const {
    devices,
    filter_meta,
    scan_meta,
    total_count,
    initial_loading,
    loading_more,
    error,
    reload,
    beginScan,
  } = useDevicesFeed({
    filters,
    sort,
    page,
    page_size,
    initial_feed,
  });
  const deferred_devices = useDeferredValue(devices);

  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (url_hydrated_ref.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length > 0) {
      const parsed = parseDeviceFeedPageQuery(params, { offset: 0, limit: page_size });
      set_filters(parsed.filters);
      set_sort(parsed.sort);
      const next_page = Math.floor(parsed.offset / parsed.limit) + 1;
      set_page(next_page);
      if (parsed.limit !== page_size) set_page_size(parsed.limit);
    }
    url_hydrated_ref.current = true;
  }, [page_size, set_filters, set_page_size]);

  useEffect(() => {
    if (!url_hydrated_ref.current || typeof window === "undefined") return;
    const search = new URLSearchParams();
    appendDeviceFeedQuery(search, {
      offset: (page - 1) * page_size,
      limit: page_size,
      sort,
      filters,
    });
    const qs = search.toString();
    const next_url = qs ? `/?${qs}` : "/";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next_url) {
      window.history.replaceState(window.history.state, "", next_url);
    }
  }, [filters, sort, page, page_size]);

  useEffect(() => {
    if (hasFeedScrollStoreHydrated()) {
      set_scroll_hydrated(true);
      return;
    }
    return onFeedScrollStoreHydrated(() => set_scroll_hydrated(true));
  }, []);

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

  const total_pages = Math.max(1, Math.ceil(total_count / page_size));
  const current_page = Math.min(page, total_pages);

  useEffect(() => {
    if (total_count === 0) return;
    if (page > total_pages) set_page(total_pages);
  }, [page, total_count, total_pages]);

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
    page,
    loading_more,
    clear_feed_scroll,
  ]);

  function handlePageSizeChange(next_page_size: number) {
    startTransition(() => {
      set_page_size(next_page_size);
      set_page(1);
    });
    clear_feed_scroll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePageChange(next_page: number) {
    startTransition(() => {
      set_page(next_page);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDeviceNavigate() {
    set_feed_scroll(window.scrollY, current_page, devices.length);
    pending_scroll_restore_ref.current = true;
  }

  useEffect(() => {
    const prev_pathname = prev_pathname_ref.current;
    if (prev_pathname === "/" && pathname.startsWith("/devices/")) {
      set_feed_scroll(window.scrollY, current_page, devices.length);
      pending_scroll_restore_ref.current = true;
    }
    prev_pathname_ref.current = pathname;
  }, [pathname, current_page, devices.length, set_feed_scroll]);

  const filter_bar_props = {
    filters,
    onChange: (next_filters: FilterValues) => set_filters(next_filters),
    brand_tree,
    models_by_brand,
    model_lines_by_brand,
    damage_type_counts,
    region_options,
    price_bounds,
    profitability_bounds,
    liquidity_bounds,
    year_bounds,
  };

  return {
    is_desktop,
    is_filters_open,
    set_is_filters_open,
    sort,
    set_sort,
    devices: deferred_devices,
    scan_meta,
    total_count,
    initial_loading,
    loading_more,
    is_pending: is_pending || loading_more || deferred_devices !== devices,
    error,
    reload,
    beginScan,
    total_pages,
    current_page,
    page_size,
    handlePageSizeChange,
    handlePageChange,
    handleDeviceNavigate,
    filter_bar_props,
  };
}
