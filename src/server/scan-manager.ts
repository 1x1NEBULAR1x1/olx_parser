import { runFullPipeline, type PipelineProgress } from "./pipeline";
import {
  createScanRun, finishScanRun, getLastScanRun, saveDevices, updateScanProgress,
} from "./devices-repository";
import { checkAndNotify } from "./notifier";
import {
  createLogger, StageTimer, estimateEtaMs, formatDuration,
} from "./logger";

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
    void updateScanProgress(scan_id, progress);
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
    if (should_write) {
      last_write_at = now;
      void updateScanProgress(scan_id, {
        stage: "saving",
        total_listings: total,
        processed_listings: processed,
      });
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
let is_scanning = false;

export async function triggerScan(): Promise<void> {
  if (is_scanning) {
    scan_log.warn("Скан уже идёт (in-memory флаг)");
    return;
  }
  if (await isScanRunningInDb()) {
    scan_log.warn("Скан уже идёт (запись ScanRun в БД)");
    return;
  }

  is_scanning = true;
  const scan_id = await createScanRun();
  const log = scan_log.child(scan_id.slice(0, 8));
  const timer = new StageTimer();
  timer.start("total");

  try {
    log.info("Запуск сканирования OLX");
    timer.start("pipeline");
    const write_progress = createThrottledProgressWriter(scan_id, timer, log);
    const devices = await runFullPipeline(write_progress);
    const pipeline_timing = timer.end("pipeline");
    log.info("Пайплайн завершён", {
      devices: devices.length,
      duration: formatDuration(pipeline_timing.duration_ms),
    });

    timer.start("saving");
    log.info("Сохранение в БД", { devices: devices.length });
    const write_saving_progress = createSavingProgressWriter(scan_id, devices.length, timer, log);
    write_saving_progress(0);
    await saveDevices(scan_id, devices, (processed) => write_saving_progress(processed));
    const saving_timing = timer.end("saving");
    log.info("Сохранение завершено", {
      devices: devices.length,
      duration: formatDuration(saving_timing.duration_ms),
    });

    await finishScanRun(scan_id, devices.length, "completed");
    log.info("Скан успешно завершён", {
      devices: devices.length,
      total_duration: formatDuration(timer.end("total").total_elapsed_ms),
    });

    try {
      await checkAndNotify(devices);
    } catch (error) {
      log.error("Ошибка проверки уведомлений", {}, error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Ошибка сканирования", { duration: formatDuration(timer.elapsedMs()) }, error);
    await finishScanRun(scan_id, 0, "failed", message);
  } finally {
    is_scanning = false;
  }
}

export function isScanning(): boolean {
  return is_scanning;
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

// Веса стадий в итоговом % — подобраны под реальное wall-time (~100с на ~450
// объявлений): анализ ~65%, финализация (медианы/рентабельность) ~14%,
// сохранение в SQLite (последовательные INSERT) ~17%. Раньше analyzing занимал
// 5-95%, из-за чего «95%» выглядело как «почти готово», хотя впереди ещё
// минуты finalize + save.
const STAGE_WEIGHTS = {
  fetching_listings: { from: 0, to: 3 },
  analyzing: { from: 3, to: 68 },
  finalizing: { from: 68, to: 82 },
  saving: { from: 82, to: 99 },
} as const;

function calculateScanPercent(scan_run: {
  status: string;
  stage: string | null;
  total_listings: number | null;
  processed_listings: number;
}): number {
  if (scan_run.status === "completed") return 100;
  if (scan_run.status !== "running") return 0;

  const stage = scan_run.stage as keyof typeof STAGE_WEIGHTS | null;
  if (!stage || !(stage in STAGE_WEIGHTS)) return 0;

  const { from, to } = STAGE_WEIGHTS[stage];
  if (
    (stage === "analyzing" || stage === "finalizing" || stage === "saving")
    && scan_run.total_listings
  ) {
    const ratio = Math.min(1, scan_run.processed_listings / scan_run.total_listings);
    return Math.round(from + ratio * (to - from));
  }
  return from;
}

export async function getScanStatus(): Promise<{
  is_scanning: boolean;
  scan_started_at: string | null;
  last_scan_finished_at: string | null;
  devices_count: number;
  stage: string | null;
  total_listings: number | null;
  processed_listings: number;
  percent: number;
}> {
  const last_scan_run = await getLastScanRun();
  const is_scanning_now = is_scanning || last_scan_run?.status === "running";

  return {
    is_scanning: is_scanning_now,
    scan_started_at: last_scan_run?.started_at.toISOString() ?? null,
    last_scan_finished_at: last_scan_run?.finished_at?.toISOString() ?? null,
    devices_count: last_scan_run?.devices_count ?? 0,
    stage: last_scan_run?.stage ?? null,
    total_listings: last_scan_run?.total_listings ?? null,
    processed_listings: last_scan_run?.processed_listings ?? 0,
    percent: last_scan_run ? calculateScanPercent(last_scan_run) : 0,
  };
}
