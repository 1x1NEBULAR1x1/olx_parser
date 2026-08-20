"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Drawer, FormControl, InputLabel, MenuItem, Select,
} from "@mui/material";
import { DeviceCard } from "@/entities/device/ui/device-card/DeviceCard";
import { FilterBar } from "@/features/device-filter/ui/filter-bar/FilterBar";
import { DEVICE_SORT_OPTIONS, type DeviceSortKey } from "@/features/device-filter/lib/sort-and-filter";
import { PAGE_SIZE_OPTIONS } from "@/features/feed-scroll/model/scroll-store";
import { ScanDashboard } from "@/features/scan-control/ui/scan-dashboard/ScanDashboard";
import { Pagination } from "@/shared/ui/pagination/Pagination";
import {
  AppShell, DeviceGrid, DeviceGridItem, EmptyState, ErrorState,
  FeedSkeleton, PageContainer, PageHeader,
} from "@/shared/ui/page-layout";
import { getErrorCopy } from "@/shared/lib/api-error";
import type { DevicesListResponse } from "@/shared/types/api-contracts";
import { useHomePage } from "../lib/use-home-page";
import styles from "./HomePage.module.scss";

interface HomePageProps {
  initial_feed?: DevicesListResponse | null;
}

export function HomePage({ initial_feed = null }: HomePageProps) {
  const t = useTranslations("sort");
  const ts = useTranslations("scan");
  const tf = useTranslations("filters");
  const t_app = useTranslations("app");
  const t_common = useTranslations("common");
  const te = useTranslations("errors");
  const home = useHomePage(initial_feed);
  const feed_error = home.error ? getErrorCopy(home.error, te) : home.scan_meta?.feed_error ?? null;
  const show_feed_error = Boolean(feed_error) && home.devices.length === 0 && !home.initial_loading;

  return (
    <AppShell>
      <PageContainer>
        <PageHeader
          title={t_app("catalog_heading")}
          subtitle={t_app("tagline")}
          actions={!home.is_desktop ? (
            <button
              type="button"
              className={styles.home_filters_btn}
              onClick={() => home.set_is_filters_open(true)}
            >
              <SlidersHorizontal size={16} aria-hidden />
              {tf("title")}
            </button>
          ) : undefined}
        />

        {(!home.initial_loading || home.scan_meta !== null) && (
          <div className={styles.home_dashboard}>
            <ScanDashboard
              is_scanning={home.scan_meta?.is_scanning ?? false}
              cached_at={home.scan_meta?.cached_at ?? null}
              devices_count={home.scan_meta?.dashboard?.market.total_devices ?? home.total_count}
              stage={home.scan_meta?.stage ?? null}
              total_listings={home.scan_meta?.total_listings ?? null}
              processed_listings={home.scan_meta?.processed_listings ?? 0}
              percent={home.scan_meta?.percent ?? 0}
              issues_count={home.scan_meta?.issues_count ?? 0}
              warnings_count={home.scan_meta?.warnings_count ?? 0}
              outcome_status={home.scan_meta?.outcome_status}
              last_scan_error={home.scan_meta?.last_scan_error}
              kept_previous_feed={home.scan_meta?.kept_previous_feed}
              feed_error={home.devices.length > 0 ? feed_error : null}
              dashboard={home.scan_meta?.dashboard ?? null}
              scan_started_at={home.scan_meta?.scan_started_at ?? null}
              onScanStarted={() => {
                home.beginScan();
                void home.reload();
              }}
            />
          </div>
        )}

        <div className={styles.home_layout}>
          {home.is_desktop && (
            <aside className={styles.home_sidebar}>
              <FilterBar {...home.filter_bar_props} />
            </aside>
          )}

          <Drawer
            anchor="left"
            open={home.is_filters_open && !home.is_desktop}
            onClose={() => home.set_is_filters_open(false)}
            slotProps={{ paper: { sx: { width: "100%", maxWidth: 360 } } }}
          >
            <div className={styles.home_drawer_head}>
              <h2 className={styles.home_drawer_title}>{tf("title")}</h2>
              <button
                type="button"
                className={styles.home_drawer_close}
                onClick={() => home.set_is_filters_open(false)}
                aria-label={t_common("close")}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className={styles.home_drawer_body}>
              <FilterBar {...home.filter_bar_props} />
            </div>
          </Drawer>

          <main className={styles.home_main}>
            {home.initial_loading ? (
              <FeedSkeleton />
            ) : show_feed_error ? (
              <ErrorState
                message={feed_error ?? te("feed_unavailable")}
                onRetry={() => void home.reload()}
              />
            ) : home.total_count === 0 ? (
              <EmptyState icon={<Search size={48} />} message={ts("no_devices")} />
            ) : (
              <>
                {home.is_pending && <div className="pending_bar" aria-hidden />}
                <div className={styles.home_toolbar} data-testid="feed-toolbar">
                  <div>
                    <p className={styles.home_count}>{tf("results_count", { count: home.total_count })}</p>
                    {home.is_pending && (
                      <p className={styles.home_count_hint}>
                        <span className={styles.home_count_spinner} aria-hidden />
                        {t_common("updating")}
                      </p>
                    )}
                  </div>

                  <div className={styles.home_toolbar_controls}>
                    <FormControl size="small" className={styles.home_sort} sx={{ minWidth: 0 }}>
                      <InputLabel id="sort-label">{t("label")}</InputLabel>
                      <Select
                        labelId="sort-label"
                        label={t("label")}
                        value={home.sort}
                        onChange={(e) => home.set_sort(e.target.value as DeviceSortKey)}
                      >
                        {DEVICE_SORT_OPTIONS.map((key) => (
                          <MenuItem key={key} value={key}>{t(key)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Pagination
                      current_page={home.current_page}
                      total_pages={home.total_pages}
                      page_size={home.page_size}
                      page_size_options={PAGE_SIZE_OPTIONS}
                      onChange={home.handlePageChange}
                      onPageSizeChange={home.handlePageSizeChange}
                    />
                  </div>
                </div>

                <DeviceGrid is_pending={home.is_pending}>
                  {home.devices.map((device, index) => (
                    <DeviceGridItem key={device.id} index={index}>
                      <DeviceCard
                        device={device}
                        onNavigate={home.handleDeviceNavigate}
                        onListingChange={home.reload}
                      />
                    </DeviceGridItem>
                  ))}
                </DeviceGrid>
              </>
            )}
          </main>
        </div>
      </PageContainer>
    </AppShell>
  );
}
