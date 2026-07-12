import { runFullPipeline, type PipelineProgress } from "./pipeline";
import {
  createScanRun, finishScanRun, getLastScanRun, saveDevices, updateScanProgress,
} from "./devices-repository";
import { checkAndNotify } from "./notifier";

// При concurrency=8 и сотнях объявлений processed_listings может тикать очень
// часто — пишем прогресс в БД не чаще раза в PROGRESS_WRITE_MIN_INTERVAL_MS,
// чтобы не заливать SQLite потоком мелких UPDATE. Первое обновление на каждой
// стадии (fetching_listings -> analyzing) и финальный processed_listings всё
// равно проходят без пропуска — важные переходы стадии не теряются.
const PROGRESS_WRITE_MIN_INTERVAL_MS = 400;

function createThrottledProgressWriter(scan_id: string): (progress: PipelineProgress) => void {
  let last_write_at = 0;
  let pending: PipelineProgress | null = null;
  let flush_timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    flush_timer = null;
    if (!pending) return;
    const progress = pending;
    pending = null;
    last_write_at = Date.now();
    void updateScanProgress(scan_id, progress);
  }

  return (progress: PipelineProgress) => {
    pending = progress;
    const stage_changed = progress.stage !== "analyzing" || progress.processed_listings === 0;
    const since_last_write = Date.now() - last_write_at;

    if (stage_changed || since_last_write >= PROGRESS_WRITE_MIN_INTERVAL_MS) {
      if (flush_timer) clearTimeout(flush_timer);
      flush();
    } else if (!flush_timer) {
      flush_timer = setTimeout(flush, PROGRESS_WRITE_MIN_INTERVAL_MS - since_last_write);
    }
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
  if (is_scanning) return;
  if (await isScanRunningInDb()) return;

  is_scanning = true;
  const scan_id = await createScanRun();

  try {
    console.log("[pipeline] Запуск сканирования OLX...");
    const write_progress = createThrottledProgressWriter(scan_id);
    const devices = await runFullPipeline(write_progress);

    await updateScanProgress(scan_id, { stage: "saving" });
    await saveDevices(scan_id, devices);
    await finishScanRun(scan_id, devices.length, "completed");
    console.log(`[pipeline] Готово: ${devices.length} устройств проанализировано.`);

    // Не должно блокировать/ронять сам скан — уведомления вторичны по
    // отношению к самому факту успешного сохранения устройств.
    try {
      await checkAndNotify(devices);
    } catch (error) {
      console.error("[notifier] Ошибка проверки уведомлений:", error);
    }
  } catch (error) {
    console.error("[pipeline] Ошибка сканирования:", error);
    await finishScanRun(scan_id, 0, "failed", String(error));
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

// Веса стадий в итоговом %: пока идёт запрос списка объявлений с OLX доля
// маленькая (реальный объём работы неизвестен, только "стартовали"), основной
// вес — анализ каждого объявления (iFixit + запчасти), сохранение в БД в
// конце — быстрая транзакция, но всё равно даёт видимый "последний шаг"
// вместо резкого скачка с 99% на "готово".
const STAGE_WEIGHTS = {
  fetching_listings: { from: 0, to: 5 },
  analyzing: { from: 5, to: 95 },
  saving: { from: 95, to: 99 },
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
  if (stage === "analyzing" && scan_run.total_listings) {
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
