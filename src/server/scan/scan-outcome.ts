export type ScanOutcomeStatus = "ok" | "degraded" | "failed";
export type ScanFeedSource = "fresh" | "partial" | "previous_snapshot";

export interface ScanOutcomeStats {
  listings_fetched: number;
  previous_count: number;
  reused: number;
  full: number;
  lightweight: number;
  lightweight_fallback: number;
  skipped: number;
  fetch_partial: boolean;
}

export interface ScanPipelineOutcome {
  status: ScanOutcomeStatus;
  source: ScanFeedSource;
  message: string | null;
  should_replace_feed: boolean;
  stats: ScanOutcomeStats;
}

/** Ниже этого отношения к прошлой ленте новый набор считаем сбоем OLX, а не реальной усадкой рынка. */
export const FEED_REPLACE_MIN_RATIO = 0.15;
export const FEED_REPLACE_MIN_PREVIOUS = 20;

export function shouldReplaceFeed(new_count: number, previous_count: number): boolean {
  if (previous_count <= 0) return new_count > 0;
  if (new_count <= 0) return false;
  if (previous_count >= FEED_REPLACE_MIN_PREVIOUS && new_count < previous_count * FEED_REPLACE_MIN_RATIO) {
    return false;
  }
  return true;
}

export function buildEmptyOutcomeStats(previous_count: number): ScanOutcomeStats {
  return {
    listings_fetched: 0,
    previous_count,
    reused: 0,
    full: 0,
    lightweight: 0,
    lightweight_fallback: 0,
    skipped: 0,
    fetch_partial: false,
  };
}

export function resolveScanOutcome(params: {
  stats: ScanOutcomeStats;
  fetch_error_message?: string | null;
}): ScanPipelineOutcome {
  const { stats } = params;
  const fetch_error_message = params.fetch_error_message?.trim() || null;
  const replace = shouldReplaceFeed(stats.listings_fetched, stats.previous_count);

  if (!replace) {
    const message = fetch_error_message
      ?? (stats.listings_fetched === 0
        ? "OLX не вернул объявления. Показана предыдущая лента."
        : `Слишком мало объявлений (${stats.listings_fetched} вместо ${stats.previous_count}). Лента не затёрта.`);
    return {
      status: "failed",
      source: "previous_snapshot",
      message,
      should_replace_feed: false,
      stats,
    };
  }

  const degraded_reasons: string[] = [];
  if (stats.fetch_partial) degraded_reasons.push("часть страниц OLX не загрузилась");
  if (stats.lightweight_fallback > 0) {
    degraded_reasons.push(`${stats.lightweight_fallback} лотов ушли в упрощённый разбор`);
  }
  if (stats.skipped > 0) degraded_reasons.push(`пропущено лотов: ${stats.skipped}`);
  if (fetch_error_message) degraded_reasons.push(fetch_error_message);

  if (degraded_reasons.length > 0) {
    return {
      status: "degraded",
      source: stats.fetch_partial ? "partial" : "fresh",
      message: `Скан завершён с ограничениями: ${degraded_reasons.join("; ")}.`,
      should_replace_feed: true,
      stats,
    };
  }

  return {
    status: "ok",
    source: "fresh",
    message: null,
    should_replace_feed: true,
    stats,
  };
}

export function deriveUiOutcome(params: {
  scan_status: string | null | undefined;
  error_message: string | null | undefined;
  issues_count: number;
  warnings_count: number;
}): { outcome_status: ScanOutcomeStatus; kept_previous_feed: boolean } {
  if (params.scan_status === "failed") {
    return { outcome_status: "failed", kept_previous_feed: true };
  }
  if (params.scan_status === "running") {
    return { outcome_status: "ok", kept_previous_feed: false };
  }
  const has_noise = Boolean(params.error_message)
    || params.issues_count > 0
    || params.warnings_count > 0;
  return {
    outcome_status: has_noise ? "degraded" : "ok",
    kept_previous_feed: false,
  };
}

export function buildScanHealthTitle(status: ScanOutcomeStatus): string {
  if (status === "failed") return "Скан не обновил ленту";
  if (status === "degraded") return "Скан завершён с ограничениями";
  return "Скан завершён";
}
