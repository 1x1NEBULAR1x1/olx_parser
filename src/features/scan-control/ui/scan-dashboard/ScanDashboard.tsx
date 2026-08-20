"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw, TrendingUp } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { startScan } from "@/shared/api/client";
import { ApiRequestError, getErrorCopy } from "@/shared/lib/api-error";
import { TermHint } from "@/shared/ui/term-hint/TermHint";
import type { AppLocale } from "@/shared/config/i18n/config";
import type { ScanDashboardStats } from "@/shared/types/api-contracts";
import type { ScanStage } from "@/shared/types/domain";
import { RingChart } from "@/features/scan-control/ui/ring-chart/RingChart";
import styles from "./ScanDashboard.module.scss";

const DATE_LOCALE_MAP: Record<AppLocale, string> = {
  pl: "pl-PL",
  en: "en-US",
  ru: "ru-RU",
};

interface ScanDashboardProps {
  is_scanning: boolean;
  cached_at: string | null;
  devices_count: number;
  stage: ScanStage | null;
  total_listings: number | null;
  processed_listings: number;
  percent: number;
  issues_count: number;
  warnings_count: number;
  outcome_status?: "ok" | "degraded" | "failed";
  last_scan_error?: string | null;
  kept_previous_feed?: boolean;
  feed_error?: string | null;
  dashboard: ScanDashboardStats | null;
  scan_started_at?: string | null;
  onScanStarted: () => void;
}

function isMissingScanMessage(value: string, key: string): boolean {
  return value === key || value === `scan.${key}`;
}

function scanCopy(
  t: (key: string, values?: Record<string, string | number>) => string,
  key: string,
  fallback: string,
  values?: Record<string, string | number>,
): string {
  const value = values ? t(key, values) : t(key);
  return isMissingScanMessage(value, key) ? fallback : value;
}

function withScanReason(base: string, reason: string | null | undefined): string {
  const cleaned = reason?.replace(/[{}#]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || base.includes(cleaned)) return base;
  return `${base} ${cleaned}`;
}

function formatDuration(sec: number | null, t: (key: string, values?: Record<string, number>) => string): string | null {
  if (sec === null || sec <= 0) return null;
  if (sec < 60) return t("duration_sec", { sec });
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (rest === 0) return t("duration_min", { min });
  return t("duration_min_sec", { min, sec: rest });
}

function useElapsedSeconds(started_at: string | null | undefined, active: boolean): number | null {
  const [now, set_now] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !started_at) return;
    const timer = setInterval(() => set_now(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, started_at]);

  if (!started_at) return null;
  const started = new Date(started_at).getTime();
  if (!Number.isFinite(started)) return null;
  return Math.max(0, Math.round((now - started) / 1000));
}

export function ScanDashboard({
  is_scanning,
  cached_at,
  devices_count,
  stage,
  total_listings,
  processed_listings,
  percent,
  issues_count,
  warnings_count,
  outcome_status = "ok",
  last_scan_error = null,
  kept_previous_feed = false,
  feed_error = null,
  dashboard,
  scan_started_at = null,
  onScanStarted,
}: ScanDashboardProps) {
  const t = useTranslations("scan");
  const te = useTranslations("errors");
  const locale = useLocale() as AppLocale;
  const [starting, set_starting] = useState(false);
  const [start_error, set_start_error] = useState<string | null>(null);
  const busy = is_scanning || starting;
  const elapsed_sec = useElapsedSeconds(scan_started_at, is_scanning);

  async function handleStart() {
    set_starting(true);
    set_start_error(null);
    try {
      await startScan();
      onScanStarted();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "scan_busy") {
        onScanStarted();
      } else {
        set_start_error(getErrorCopy(error, te));
      }
    } finally {
      set_starting(false);
    }
  }

  const panel_class = [
    styles.panel,
    is_scanning ? styles.panel_scanning : styles.panel_idle,
  ].join(" ");

  const formatted_date = cached_at
    ? new Date(cached_at).toLocaleString(DATE_LOCALE_MAP[locale], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    : null;

  const stage_label = stage ? t(`stage_${stage}` as const) : t("in_progress");
  const progress_detail = total_listings && is_scanning
    ? stage === "saving"
      ? t("progress_saving", { processed: processed_listings, total: total_listings })
      : stage === "finalizing"
        ? t("progress_finalizing", { processed: processed_listings, total: total_listings })
        : stage === "analyzing"
          ? t("progress_of", { processed: processed_listings, total: total_listings })
          : null
    : null;

  const last_scan = dashboard?.last_scan ?? null;
  const cache = dashboard?.cache ?? null;
  const market = dashboard?.market ?? null;
  const live_duration = is_scanning
    ? formatDuration(elapsed_sec, t)
    : formatDuration(last_scan?.duration_sec ?? null, t);
  const live_listings_label = is_scanning && total_listings
    ? t("stat_listings_progress", { processed: processed_listings, total: total_listings })
    : last_scan?.listings_total != null
      ? t("stat_listings", { count: last_scan.listings_total })
      : null;

  const alert_text = start_error
    ?? feed_error
    ?? (!is_scanning && outcome_status === "failed"
      ? withScanReason(
        scanCopy(
          t,
          kept_previous_feed ? "scan_failed_keep_feed" : "scan_failed_generic",
          t("scan_failed_generic"),
        ),
        last_scan_error,
      )
      : !is_scanning && last_scan_error
        ? withScanReason(scanCopy(t, "scan_degraded", t("scan_failed_generic")), last_scan_error)
        : !is_scanning && outcome_status !== "ok"
          ? scanCopy(t, "scan_degraded_issues", t("issues_summary", { issues: issues_count, warnings: warnings_count }), {
            issues: issues_count,
            warnings: warnings_count,
          })
          : null);

  return (
    <section
      className={panel_class}
      aria-label={t("dashboard_title")}
      aria-busy={busy || undefined}
      data-testid="scan-dashboard"
    >
      <div className={styles.panel_header}>
        <div className={styles.panel_header_text}>
          <div className={styles.panel_title}>
            {t("dashboard_title")}
          </div>
          <div className={styles.panel_subtitle}>
            {is_scanning
              ? [stage_label, progress_detail].filter(Boolean).join(" · ")
              : formatted_date
                ? t("last_update_with_count", { date: formatted_date, count: devices_count })
                : t("dashboard_idle_hint")}
          </div>
          {alert_text && (
            <div
              className={
                outcome_status === "failed" || start_error || feed_error
                  ? styles.panel_alert_error
                  : styles.panel_alert_warn
              }
              role="status"
            >
              {alert_text}
            </div>
          )}
        </div>

        <button
          type="button"
          className={`${styles.panel_btn} ${busy ? styles.panel_btn_busy : ""}`}
          onClick={handleStart}
          disabled={busy}
        >
          <RefreshCw size={15} aria-hidden className={busy ? styles.panel_btn_icon_spin : undefined} />
          {busy ? t("updating") : t("start")}
        </button>
      </div>

      {is_scanning && (
        <div className={styles.panel_progress}>
          <div className={styles.panel_progress_track}>
            <div className={styles.panel_progress_fill} style={{ width: `${percent}%` }} />
          </div>
          <div className={styles.panel_progress_meta}>
            <span>{percent}%</span>
            {progress_detail && <span>{progress_detail}</span>}
          </div>
        </div>
      )}

      {dashboard && (
        <div className={styles.stats_grid}>
          <article className={`${styles.stat_card} ${is_scanning ? styles.stat_card_live : ""}`}>
            <div className={styles.stat_card_head}>
              <RefreshCw size={16} aria-hidden className={is_scanning ? styles.stat_card_icon_spin : undefined} />
              <h3 className={styles.stat_card_title}>
                <TermHint label={t("ring_last_scan")} hint={t("ring_last_scan_hint")} compact />
              </h3>
            </div>
            <div className={styles.stat_card_body}>
              <RingChart
                value={is_scanning ? percent : (last_scan?.yield_pct ?? 0)}
                color="var(--color-primary)"
                is_busy={is_scanning}
                center_label={is_scanning
                  ? `${percent}%`
                  : last_scan
                    ? `${last_scan.yield_pct}%`
                    : "—"}
                center_sublabel={is_scanning
                  ? t("ring_live_sublabel")
                  : last_scan
                    ? t("ring_yield_sublabel", { devices: last_scan.devices_saved })
                    : t("ring_no_scan")}
                aria_label={is_scanning
                  ? t("ring_progress_aria", { pct: percent })
                  : t("ring_last_scan_aria", {
                    pct: last_scan?.yield_pct ?? 0,
                    devices: last_scan?.devices_saved ?? 0,
                  })}
              />
              <ul className={styles.stat_details}>
                {live_listings_label && <li>{live_listings_label}</li>}
                {live_duration && <li>{live_duration}</li>}
                <li>{t("stat_health", { pct: last_scan?.health_pct ?? 100 })}</li>
                {(last_scan?.issues_count ?? issues_count) > 0 || (last_scan?.warnings_count ?? warnings_count) > 0 ? (
                  <li className={styles.stat_muted}>
                    {t("issues_summary", {
                      issues: is_scanning ? issues_count : (last_scan?.issues_count ?? issues_count),
                      warnings: is_scanning ? warnings_count : (last_scan?.warnings_count ?? warnings_count),
                    })}
                  </li>
                ) : null}
              </ul>
            </div>
          </article>

          <article className={`${styles.stat_card} ${is_scanning ? styles.stat_card_live : ""}`}>
            <div className={styles.stat_card_head}>
              <Database size={16} aria-hidden />
              <h3 className={styles.stat_card_title}>
                <TermHint label={t("ring_cache")} hint={t("ring_cache_hint")} compact />
              </h3>
            </div>
            <div className={styles.stat_card_body}>
              <RingChart
                value={cache?.freshness_pct ?? 0}
                color="var(--color-positive)"
                is_busy={is_scanning}
                center_label={cache ? `${cache.freshness_pct}%` : "—"}
                center_sublabel={t("ring_cache_sublabel")}
                aria_label={t("ring_cache_aria", { pct: cache?.freshness_pct ?? 0 })}
              />
              <ul className={styles.stat_details}>
                <li>{t("stat_model_cache", { fresh: cache?.model_cache_fresh ?? 0, total: cache?.model_cache_total ?? 0 })}</li>
                <li>{t("stat_parts_cache", { fresh: cache?.parts_cache_fresh ?? 0, total: cache?.parts_cache_total ?? 0 })}</li>
                <li>{t("stat_catalog", { ready: cache?.catalog_ready ?? 0, total: cache?.catalog_total ?? 0 })}</li>
                <li className={styles.stat_muted}>{t("stat_cache_ttl", { hours: cache?.cache_ttl_hours ?? 72 })}</li>
              </ul>
            </div>
          </article>

          <article className={`${styles.stat_card} ${is_scanning ? styles.stat_card_live : ""}`}>
            <div className={styles.stat_card_head}>
              <TrendingUp size={16} aria-hidden />
              <h3 className={styles.stat_card_title}>
                <TermHint label={t("ring_market")} hint={t("ring_market_hint")} compact />
              </h3>
            </div>
            <div className={styles.stat_card_body}>
              <RingChart
                value={market?.profitable_share_pct ?? 0}
                color="var(--color-warning)"
                is_busy={is_scanning}
                center_label={market ? `${market.profitable_share_pct}%` : "—"}
                center_sublabel={market?.avg_profitability_pct !== null && market?.avg_profitability_pct !== undefined
                  ? t("ring_market_sublabel_avg", { pct: market.avg_profitability_pct })
                  : t("ring_market_sublabel")}
                aria_label={t("ring_market_aria", { pct: market?.profitable_share_pct ?? 0 })}
              />
              <ul className={styles.stat_details}>
                <li>{t("stat_devices_total", { count: market?.total_devices ?? 0 })}</li>
                <li>{t("stat_damaged_share", { pct: market?.damaged_share_pct ?? 0, count: market?.damaged_count ?? 0 })}</li>
                <li>{t("stat_high_profit", { pct: market?.high_profit_share_pct ?? 0, count: market?.high_profit_count ?? 0 })}</li>
                {market?.avg_price_pln !== null && market?.avg_price_pln !== undefined && (
                  <li className={styles.stat_muted}>{t("stat_avg_price", { price: market.avg_price_pln })}</li>
                )}
              </ul>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
