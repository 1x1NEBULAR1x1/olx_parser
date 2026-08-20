import { runFullPipeline, type PipelineProgress } from "./pipeline";
import {
  createScanRun, finishScanRun, getLastScanRun, saveDevices, updateScanProgress,
  expireStaleScanRuns,
} from "@/server/repositories/devices-repository";
import { savePriceHistoryFromScan } from "@/server/repositories/price-history-repository";
import {
  isScanLockActive,
  releaseScanLock,
  tryAcquireScanLock,
} from "@/server/repositories/scan-coordinator-repository";
import {
  ensureExpectedScanWarningsPruned,
  saveScanIssues,
  ScanIssueCollector,
} from "@/server/repositories/scan-issues-repository";
import { syncCatalogFromLatestDevices } from "@/server/repositories/catalog-repository";
import { checkAndNotify } from "@/server/domain/notifier";
import {
  createLogger, StageTimer, estimateEtaMs, formatDuration,
} from "@/server/shared/logger";
import { getScanDashboardStats } from "./scan-dashboard-stats";
import { calculateScanPercent } from "./scan-progress";
import { config } from "@/server/shared/config";
import { deriveUiOutcome, shouldReplaceFeed, type ScanOutcomeStatus } from "./scan-outcome";
import { publishScanUpdate, subscribeScanUpdate } from "@/server/shared/live-hub";
import { waitUntil } from "@/server/shared/long-poll";

const scan_log = createLogger("scan");

// При concurrency=8 и сотнях объявлений processed_listings может тикать очень
// часто — пишем прогресс в БД не чаще раза в PROGRESS_WRITE_MIN_INTERVAL_MS,
// чтобы не заливать SQLite потоком мелких UPDATE. Первое обновление на каждой
// стадии (fetching_listings -> analyzing) и финальный processed_listings всё
// равно проходят без пропуска — важные переходы стадии не теряются.
const PROGRESS_WRITE_MIN_INTERVAL_MS = 400;
const PROGRESS_LOG_EVERY_N = 50;

function createThrottledProgressWriter(
  scan_id: string,
  timer: StageTimer,
  log: ReturnType<typeof createLogger>,
): (progress: PipelineProgress) => void {
  let last_write_at = 0;
  let pending: PipelineProgress | null = null;
  let flush_timer: ReturnType<typeof setTimeout> | null = null;
  let last_logged_processed = 0;

  function flush() {
    flush_timer = null;
    if (!pending) return;
    const progress = pending;
    pending = null;
    last_write_at = Date.now();
    void updateScanProgress(
      scan_id,
      progress.stage === "fetching_listings"
        ? { stage: "fetching_listings" }
        : progress,
    );
  }

  function maybeLogProgress(progress: PipelineProgress) {
    if (!progress.total_listings || progress.processed_listings === undefined) return;
    const processed = progress.processed_listings;
    const total = progress.total_listings;
    const should_log = processed === 0
      || processed === total
      || processed - last_logged_processed >= PROGRESS_LOG_EVERY_N;
    if (!should_log) return;

    last_logged_processed = processed;
    const stage_key = progress.stage;
    const eta_ms = estimateEtaMs(processed, total, timer.elapsedMs(stage_key));
    log.info(`Прогресс: ${progress.stage}`, {
      processed,
      total,
      percent_in_stage: total > 0 ? Math.round((processed / total) * 100) : 0,
      stage_elapsed: formatDuration(timer.elapsedMs(stage_key)),
      eta: eta_ms !== null ? formatDuration(eta_ms) : null,
    });
  }

  return (progress: PipelineProgress) => {
    rememberLiveProgress(scan_id, progress);
    pending = progress;
    const is_incremental_stage = progress.stage === "analyzing" || progress.stage === "finalizing";
    const stage_changed = !is_incremental_stage || progress.processed_listings === 0;
    const since_last_write = Date.now() - last_write_at;

    if (stage_changed) {
      if (progress.stage === "analyzing" || progress.stage === "finalizing") {
        timer.start(progress.stage);
      }
      log.info(`Стадия: ${progress.stage}`, {
        total: progress.total_listings ?? null,
      });
      last_logged_processed = 0;
    }

    maybeLogProgress(progress);

    if (stage_changed || since_last_write >= PROGRESS_WRITE_MIN_INTERVAL_MS) {
      if (flush_timer) clearTimeout(flush_timer);
      flush();
    } else if (!flush_timer) {
      flush_timer = setTimeout(flush, PROGRESS_WRITE_MIN_INTERVAL_MS - since_last_write);
    }
  };
}

function createSavingProgressWriter(
  scan_id: string,
  total: number,
  timer: StageTimer,
  log: ReturnType<typeof createLogger>,
): (processed: number) => void {
  let last_write_at = 0;
  let last_logged_processed = 0;

  return (processed: number) => {
    const now = Date.now();
    const should_write = processed === 0
      || processed === total
      || now - last_write_at >= PROGRESS_WRITE_MIN_INTERVAL_MS;
    const saving_progress = {
      stage: "saving" as const,
      total_listings: total,
      processed_listings: processed,
    };
    rememberLiveProgress(scan_id, saving_progress);
    if (should_write) {
      last_write_at = now;
      void updateScanProgress(scan_id, saving_progress);
    }

    const should_log = processed === 0
      || processed === total
      || processed - last_logged_processed >= PROGRESS_LOG_EVERY_N;
    if (!should_log) return;

    last_logged_processed = processed;
    const eta_ms = estimateEtaMs(processed, total, timer.elapsedMs("saving"));
    log.info("Прогресс: saving", {
      processed,
      total,
      stage_elapsed: formatDuration(timer.elapsedMs("saving")),
      eta: eta_ms !== null ? formatDuration(eta_ms) : null,
    });
  };
}

// In-memory флаг быстро отражает состояние в рамках одного модуля/процесса, но
// в dev-режиме Next.js instrumentation.ts (автозапуск скана) и Route Handlers
// могут получать разные инстансы модуля, из-за чего чтение только этого
// флага может дать ложный "false" пока скан на самом деле идёт. Поэтому
// источником истины для внешнего мира является БД (ScanRun.status === "running"),
// а in-memory флаг используется как дополнительная защита от параллельного
// запуска внутри одного и того же инстанса модуля.
interface LiveScanProgress {
  scan_id: string;
  stage: string | null;
  total_listings: number | null;
  processed_listings: number;
  stage_started_at: number;
  last_tick_at: number;
}

let is_scanning = false;
let last_scan_triggered_at = 0;
let live_progress: LiveScanProgress | null = null;
let last_dashboard: Awaited<ReturnType<typeof getScanDashboardStats>> | null = null;
let last_dashboard_at = 0;
const DASHBOARD_REFRESH_MS = 8_000;
let scan_publish_timer: ReturnType<typeof setTimeout> | null = null;
let last_scan_publish_at = 0;
const SCAN_PUBLISH_MIN_INTERVAL_MS = 1_000;

function notifyScanWaiters(immediate = false): void {
  if (immediate) {
    if (scan_publish_timer) {
      clearTimeout(scan_publish_timer);
      scan_publish_timer = null;
    }
    last_scan_publish_at = Date.now();
    publishScanUpdate();
    return;
  }

  const elapsed = Date.now() - last_scan_publish_at;
  if (elapsed >= SCAN_PUBLISH_MIN_INTERVAL_MS) {
    last_scan_publish_at = Date.now();
    publishScanUpdate();
    return;
  }

  if (!scan_publish_timer) {
    scan_publish_timer = setTimeout(() => {
      scan_publish_timer = null;
      last_scan_publish_at = Date.now();
      publishScanUpdate();
    }, SCAN_PUBLISH_MIN_INTERVAL_MS - elapsed);
  }
}

function rememberLiveProgress(
  scan_id: string,
  progress: { stage: string; total_listings?: number; processed_listings?: number },
): void {
  const now = Date.now();
  const stage_changed = live_progress?.scan_id !== scan_id || live_progress.stage !== progress.stage;
  notifyScanWaiters(stage_changed);
  live_progress = {
    scan_id,
    stage: progress.stage,
    total_listings: progress.total_listings ?? live_progress?.total_listings ?? null,
    processed_listings: progress.processed_listings ?? live_progress?.processed_listings ?? 0,
    stage_started_at: stage_changed || !live_progress ? now : live_progress.stage_started_at,
    last_tick_at: now,
  };
}

export async function triggerScan(): Promise<void> {
  if (is_scanning) {
    scan_log.warn("Скан уже идёт (in-memory флаг)");
    return;
  }
  if (await isScanRunningInDb()) {
    scan_log.warn("Скан уже идёт (запись ScanRun в БД)");
    return;
  }
  if (await isScanLockActive()) {
    scan_log.warn("Скан уже идёт (ScanCoordinator lock)");
    return;
  }

  const min_interval_ms = config.pipeline.scan_min_interval_sec * 1000;
  const since_last_scan_ms = Date.now() - last_scan_triggered_at;
  if (last_scan_triggered_at > 0 && since_last_scan_ms < min_interval_ms) {
    const wait_sec = Math.ceil((min_interval_ms - since_last_scan_ms) / 1000);
    scan_log.warn("Скан отклонён: слишком рано после предыдущего запуска", {
      wait_sec,
      min_interval_sec: config.pipeline.scan_min_interval_sec,
    });
    return;
  }

  last_scan_triggered_at = Date.now();
  is_scanning = true;
  notifyScanWaiters(true);
  const scan_id = await createScanRun();
  rememberLiveProgress(scan_id, { stage: "fetching_listings", processed_listings: 0 });
  if (!await tryAcquireScanLock(scan_id)) {
    scan_log.warn("Не удалось захватить ScanCoordinator lock");
    await finishScanRun(scan_id, 0, "failed", "Scan lock занят");
    is_scanning = false;
    notifyScanWaiters(true);
    return;
  }
  const log = scan_log.child(scan_id.slice(0, 8));
  const timer = new StageTimer();
  timer.start("total");

  try {
    log.info("Запуск сканирования OLX");
    timer.start("pipeline");
    const write_progress = createThrottledProgressWriter(scan_id, timer, log);
    const issue_collector = new ScanIssueCollector();
    const pipeline_result = await runFullPipeline(write_progress, issue_collector);
    const devices = pipeline_result.devices;
    let outcome = pipeline_result.outcome;
    const pipeline_timing = timer.end("pipeline");
    log.info("Пайплайн завершён", {
      devices: devices.length,
      outcome: outcome.status,
      source: outcome.source,
      duration: formatDuration(pipeline_timing.duration_ms),
    });

    if (outcome.should_replace_feed && !shouldReplaceFeed(devices.length, outcome.stats.previous_count)) {
      issue_collector.recordError({
        kind: "feed_not_replaced",
        message: "После анализа не осталось лотов — лента не затёрта",
      });
      outcome = {
        ...outcome,
        status: "failed",
        source: "previous_snapshot",
        should_replace_feed: false,
        message: "После анализа не осталось лотов. Показана предыдущая лента.",
      };
    }

    if (!outcome.should_replace_feed) {
      await saveScanIssues(scan_id, issue_collector.getItems());
      const { issues_count, warnings_count } = issue_collector.getCounts();
      log.warn("Лента не заменена, оставляем предыдущий снимок", {
        message: outcome.message,
        issues_count,
        warnings_count,
      });
      await finishScanRun(scan_id, 0, "failed", outcome.message ?? "Лента не обновлена");
      try {
        const { notifyScanHealth } = await import("@/server/domain/notifier");
        await notifyScanHealth({
          status: "failed",
          message: outcome.message ?? "Скан не обновил ленту",
          scan_id,
        });
      } catch (error) {
        log.error("Ошибка уведомления о здоровье скана", {}, error);
      }
      return;
    }

    timer.start("saving");
    log.info("Сохранение в БД", { devices: devices.length });
    const write_saving_progress = createSavingProgressWriter(scan_id, devices.length, timer, log);
    write_saving_progress(0);
    await saveDevices(scan_id, devices, (processed) => write_saving_progress(processed));
    try {
      const history_rows = await savePriceHistoryFromScan(scan_id, devices);
      log.info("История цен сохранена", { rows: history_rows });
    } catch (error) {
      log.warn("История цен не сохранена, лента уже записана", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const saving_timing = timer.end("saving");
    log.info("Сохранение завершено", {
      devices: devices.length,
      duration: formatDuration(saving_timing.duration_ms),
    });

    try {
      await saveScanIssues(scan_id, issue_collector.getItems());
      const { issues_count, warnings_count } = issue_collector.getCounts();
      log.info("Журнал скана", { issues_count, warnings_count });
    } catch (error) {
      log.warn("Журнал скана не записан, лента уже сохранена", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await finishScanRun(
      scan_id,
      devices.length,
      "completed",
      outcome.status === "ok" ? undefined : (outcome.message ?? undefined),
    );
    log.info("Скан успешно завершён", {
      devices: devices.length,
      outcome: outcome.status,
      total_duration: formatDuration(timer.end("total").total_elapsed_ms),
    });

    try {
      const synced = await syncCatalogFromLatestDevices();
      log.info("Каталог моделей синхронизирован", { models: synced });
    } catch (error) {
      log.warn("Не удалось синхронизировать каталог моделей", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await checkAndNotify(devices);
    } catch (error) {
      log.error("Ошибка проверки уведомлений", {}, error);
    }

    try {
      const {
        enqueueKimovilPrefetch,
        enqueueMedianCacheWrites,
        enqueueOlxMarketPrefetch,
        enqueueL2CacheWrites,
      } = await import("./scan-jobs");
      enqueueL2CacheWrites(pipeline_result.ifixit_cache_writes, pipeline_result.parts_cache_writes);
      enqueueMedianCacheWrites(pipeline_result.fresh_medians, pipeline_result.cache_ttl_hours);
      enqueueOlxMarketPrefetch(pipeline_result.olx_market_prefetch, pipeline_result.cache_ttl_hours);
      enqueueKimovilPrefetch(devices, pipeline_result.cache_ttl_hours);
    } catch (error) {
      log.warn("Не удалось поставить фоновые задачи после скана", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (outcome.status !== "ok") {
      try {
        const { notifyScanHealth } = await import("@/server/domain/notifier");
        await notifyScanHealth({
          status: outcome.status,
          message: outcome.message ?? "Скан завершён с ограничениями",
          scan_id,
        });
      } catch (error) {
        log.error("Ошибка уведомления о здоровье скана", {}, error);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Ошибка сканирования", { duration: formatDuration(timer.elapsedMs()) }, error);
    await finishScanRun(scan_id, 0, "failed", message);
    try {
      const { notifyScanHealth } = await import("@/server/domain/notifier");
      await notifyScanHealth({
        status: "failed",
        message,
        scan_id,
      });
    } catch (notify_error) {
      log.error("Ошибка уведомления о сбое скана", {}, notify_error);
    }
  } finally {
    live_progress = null;
    await releaseScanLock(scan_id);
    is_scanning = false;
    notifyScanWaiters(true);
  }
}

export function isScanning(): boolean {
  return is_scanning;
}

export function getScanCooldownRemainingSec(): number {
  const min_interval_ms = config.pipeline.scan_min_interval_sec * 1000;
  if (last_scan_triggered_at <= 0) return 0;
  const remaining_ms = min_interval_ms - (Date.now() - last_scan_triggered_at);
  return remaining_ms > 0 ? Math.ceil(remaining_ms / 1000) : 0;
}

async function isScanRunningInDb(): Promise<boolean> {
  const last_scan_run = await getLastScanRun();
  return last_scan_run?.status === "running";
}

/**
 * Единая проверка "идёт ли сканирование прямо сейчас": true, если хотя бы
 * один из источников (in-memory флаг ИЛИ последняя запись ScanRun в БД)
 * говорит, что скан активен. Это защищает от гонки между instrumentation.ts
 * (автозапуск при старте сервера) и Route Handlers, которые в dev-режиме
 * Next.js могут исполняться в разных инстансах модуля.
 */
export async function isScanningEffective(): Promise<boolean> {
  if (is_scanning) return true;
  return isScanRunningInDb();
}

export interface GetScanStatusOptions {
  light?: boolean;
}

export async function getScanStatus(options: GetScanStatusOptions = {}): Promise<{
  is_scanning: boolean;
  scan_started_at: string | null;
  last_scan_finished_at: string | null;
  last_scan_status: string | null;
  last_scan_error: string | null;
  outcome_status: ScanOutcomeStatus;
  kept_previous_feed: boolean;
  devices_count: number;
  stage: string | null;
  total_listings: number | null;
  processed_listings: number;
  percent: number;
  issues_count: number;
  warnings_count: number;
  last_scan_id: string | null;
  dashboard: Awaited<ReturnType<typeof getScanDashboardStats>>;
  cursor: string;
}> {
  if (!options.light) {
    await expireStaleScanRuns(config.pipeline.scan_stale_timeout_minutes);
    await ensureExpectedScanWarningsPruned();
  }

  const last_scan_run = await getLastScanRun();
  const is_scanning_now = is_scanning || last_scan_run?.status === "running";
  const finished_at = last_scan_run?.finished_at?.getTime() ?? 0;
  const dashboard_stale = Date.now() - last_dashboard_at >= DASHBOARD_REFRESH_MS;
  const dashboard_behind_finish = Boolean(finished_at && finished_at > last_dashboard_at);

  let dashboard = last_dashboard;
  if (
    !options.light
    || !dashboard
    || (is_scanning_now && dashboard_stale)
    || dashboard_behind_finish
  ) {
    dashboard = await getScanDashboardStats();
    last_dashboard = dashboard;
    last_dashboard_at = Date.now();
  }
  const live = live_progress
    && last_scan_run
    && live_progress.scan_id === last_scan_run.id
    ? live_progress
    : null;
  const stage = live?.stage ?? last_scan_run?.stage ?? null;
  const total_listings = live?.total_listings ?? last_scan_run?.total_listings ?? null;
  const processed_listings = live?.processed_listings ?? last_scan_run?.processed_listings ?? 0;
  const now = Date.now();
  const stage_elapsed_ms = live
    ? now - live.stage_started_at
    : stage === "fetching_listings" && last_scan_run?.started_at
      ? now - last_scan_run.started_at.getTime()
      : 0;
  const item_elapsed_ms = live ? now - live.last_tick_at : 0;

  const ui_outcome = deriveUiOutcome({
    scan_status: last_scan_run?.status,
    error_message: last_scan_run?.error_message,
    issues_count: last_scan_run?.issues_count ?? 0,
    warnings_count: last_scan_run?.warnings_count ?? 0,
  });

  const payload = {
    is_scanning: is_scanning_now,
    scan_started_at: last_scan_run?.started_at.toISOString() ?? null,
    last_scan_finished_at: last_scan_run?.finished_at?.toISOString() ?? null,
    last_scan_status: last_scan_run?.status ?? null,
    last_scan_error: last_scan_run?.error_message ?? null,
    outcome_status: ui_outcome.outcome_status,
    kept_previous_feed: ui_outcome.kept_previous_feed,
    devices_count: last_scan_run?.devices_count ?? 0,
    stage,
    total_listings: stage === "fetching_listings" ? null : total_listings,
    processed_listings: stage === "fetching_listings" ? 0 : processed_listings,
    percent: last_scan_run
      ? calculateScanPercent({
        status: last_scan_run.status,
        stage,
        total_listings,
        processed_listings,
        stage_elapsed_ms,
        item_elapsed_ms,
      })
      : 0,
    issues_count: last_scan_run?.issues_count ?? 0,
    warnings_count: last_scan_run?.warnings_count ?? 0,
    last_scan_id: last_scan_run?.id ?? null,
    dashboard,
  };

  return {
    ...payload,
    cursor: buildScanCursor({
      ...payload,
      progress_tick: live?.last_tick_at ?? 0,
    }),
  };
}

export function buildScanCursor(status: {
  is_scanning: boolean;
  last_scan_id: string | null;
  stage: string | null;
  processed_listings: number;
  last_scan_status: string | null;
  outcome_status: string;
  progress_tick?: number;
}): string {
  return [
    status.is_scanning ? "1" : "0",
    status.last_scan_id ?? "",
    status.stage ?? "",
    String(status.processed_listings),
    status.last_scan_status ?? "",
    status.outcome_status,
    String(status.progress_tick ?? 0),
  ].join("|");
}

export async function waitForScanCursorChange(
  cursor: string,
  timeout_ms: number,
  signal?: AbortSignal,
): Promise<"ready" | "timeout"> {
  if (!cursor) return "ready";
  return waitUntil({
    timeout_ms,
    signal,
    subscribe: subscribeScanUpdate,
    is_ready: async () => {
      const status = await getScanStatus({ light: true });
      return status.cursor !== cursor;
    },
  });
}
