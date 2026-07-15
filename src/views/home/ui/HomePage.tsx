"use client";

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Search, SlidersHorizontal, Smartphone, X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Box, Button, CircularProgress, Drawer, FormControl, IconButton,
  InputLabel, MenuItem, Select, Stack, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import { DeviceCard } from "@/entities/device/ui/device-card/DeviceCard";
import { FilterBar } from "@/features/device-filter/ui/filter-bar/FilterBar";
import {
  DEVICE_SORT_OPTIONS,
  filterDevices,
  sortDevices,
  type DeviceSortKey,
} from "@/features/device-filter/lib/sort-and-filter";
import type { FilterValues } from "@/features/device-filter/model/filter-values";
import { useFiltersStore } from "@/features/device-filter/model/filters-store";
import {
  useScrollStore,
  PAGE_SIZE_OPTIONS,
  hasFeedScrollStoreHydrated,
  onFeedScrollStoreHydrated,
} from "@/features/feed-scroll/model/scroll-store";
import { useDevicesFeed } from "@/features/scan-control/lib/useDevicesFeed";
import { ScanBanner } from "@/features/scan-control/ui/scan-banner/ScanBanner";
import { HeaderActions } from "@/widgets/header/ui/header-actions/HeaderActions";
import { Pagination } from "@/shared/ui/pagination/Pagination";
import {
  AppShell, DeviceGrid, DeviceGridItem, EmptyState,
  LoadingCenter, PageContainer, StickyHeader,
} from "@/shared/ui/page-layout";

export function HomePage() {
  const theme = useTheme();
  const is_desktop = useMediaQuery(theme.breakpoints.up("lg"));
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

  const [sort, set_sort] = useState<DeviceSortKey>("recommended_repair");
  const [is_filters_open, set_is_filters_open] = useState(false);
  const [page, set_page] = useState(1);
  const [scroll_hydrated, set_scroll_hydrated] = useState(false);
  const [scroll_restored, set_scroll_restored] = useState(false);
  const is_first_filter_render = useRef(true);
  const pathname = usePathname() ?? "";
  const prev_pathname_ref = useRef(pathname);
  const pending_scroll_restore_ref = useRef(false);

  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

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

  function handleDeviceNavigate() {
    set_feed_scroll(window.scrollY, current_page, loaded_count);
    pending_scroll_restore_ref.current = true;
  }

  useEffect(() => {
    const prev_pathname = prev_pathname_ref.current;
    if (prev_pathname === "/" && pathname.startsWith("/devices/")) {
      set_feed_scroll(window.scrollY, current_page, loaded_count);
      pending_scroll_restore_ref.current = true;
    }
    prev_pathname_ref.current = pathname;
  }, [pathname, current_page, loaded_count, set_feed_scroll]);

  const show_chunk_progress = !initial_loading && loaded_count < total_count;

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

  return (
    <AppShell>
      <StickyHeader
        title={(
          <Typography
            variant="h3"
            component="h1"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              fontWeight: 900,
              minWidth: 0,
            }}
          >
            <Smartphone size={22} color={theme.palette.primary.main} aria-hidden />
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              SmartFlip
            </Box>
          </Typography>
        )}
        subtitle={(
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: { xs: "none", sm: "block" }, mt: 0.25 }}
          >
            {t_app("tagline")}
          </Typography>
        )}
        actions={(
          <>
            {!is_desktop && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<SlidersHorizontal size={16} />}
                onClick={() => set_is_filters_open(true)}
              >
                {tf("title")}
              </Button>
            )}
            <HeaderActions />
          </>
        )}
      />

      <PageContainer>
        {(!initial_loading || scan_meta !== null) && (
          <Box sx={{ mb: 3 }}>
            <ScanBanner
              is_scanning={scan_meta?.is_scanning ?? false}
              cached_at={scan_meta?.cached_at ?? null}
              devices_count={scan_meta?.total_count ?? total_count}
              stage={scan_meta?.stage ?? null}
              total_listings={scan_meta?.total_listings ?? null}
              processed_listings={scan_meta?.processed_listings ?? 0}
              percent={scan_meta?.percent ?? 0}
              issues_count={scan_meta?.issues_count ?? 0}
              warnings_count={scan_meta?.warnings_count ?? 0}
              onScanStarted={reload}
            />
          </Box>
        )}

        <Stack direction="row" spacing={3}>
          {is_desktop && (
            <Box sx={{ width: 288, flexShrink: 0 }}>
              <FilterBar {...filter_bar_props} />
            </Box>
          )}

          <Drawer
            anchor="left"
            open={is_filters_open && !is_desktop}
            onClose={() => set_is_filters_open(false)}
            slotProps={{ paper: { sx: { width: "100%", maxWidth: 360 } } }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2,
                py: 1.5,
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{tf("title")}</Typography>
              <IconButton size="small" onClick={() => set_is_filters_open(false)} aria-label="close">
                <X size={20} />
              </IconButton>
            </Box>
            <Box sx={{ p: 2 }}>
              <FilterBar {...filter_bar_props} />
            </Box>
          </Drawer>

          <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
            {initial_loading ? (
              <LoadingCenter label={ts("in_progress")} />
            ) : filtered_sorted.length === 0 ? (
              <EmptyState icon={<Search size={48} />} message={ts("no_devices")} />
            ) : (
              <>
                <Stack
                  spacing={2}
                  sx={{
                    mb: 2,
                    flexDirection: { xs: "column", sm: "row" },
                    alignItems: { xs: "stretch", sm: "flex-start" },
                    justifyContent: "space-between",
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {tf("results_count", { count: filtered_sorted.length })}
                    </Typography>
                    {show_chunk_progress && (
                      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                        {loading_more && <CircularProgress size={12} color="inherit" />}
                        <Typography variant="caption" color="text.secondary">
                          {ts("loaded_of", { loaded: loaded_count, total: total_count })}
                        </Typography>
                      </Stack>
                    )}
                  </Box>

                  <Stack
                    spacing={1.5}
                    data-testid="feed-toolbar"
                    sx={{ width: { xs: "100%", sm: "auto" }, alignItems: { sm: "flex-end" } }}
                  >
                    <FormControl size="small" sx={{ minWidth: { sm: 220 }, width: { xs: "100%", sm: "auto" } }}>
                      <InputLabel id="sort-label">{t("label")}</InputLabel>
                      <Select
                        labelId="sort-label"
                        label={t("label")}
                        value={sort}
                        onChange={(e) => set_sort(e.target.value as DeviceSortKey)}
                      >
                        {DEVICE_SORT_OPTIONS.map((key) => (
                          <MenuItem key={key} value={key}>{t(key)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Pagination
                      current_page={current_page}
                      total_pages={total_pages}
                      page_size={page_size}
                      page_size_options={PAGE_SIZE_OPTIONS}
                      onChange={handlePageChange}
                      onPageSizeChange={handlePageSizeChange}
                    />
                  </Stack>
                </Stack>

                <DeviceGrid>
                  {paginated_devices.map((device) => (
                    <DeviceGridItem key={device.id}>
                      <DeviceCard
                        device={device}
                        onNavigate={handleDeviceNavigate}
                        onListingChange={reload}
                      />
                    </DeviceGridItem>
                  ))}
                </DeviceGrid>
              </>
            )}
          </Box>
        </Stack>
      </PageContainer>
    </AppShell>
  );
}
