import { enrichCatalogEntryById } from "@/server/catalog/catalog-enrichment-service";
import {
  finishCatalogLiveProgress,
  getCatalogLiveProgress,
  listCatalogManualJobs,
  patchCatalogLiveProgress,
  startCatalogLiveProgress,
} from "@/server/catalog/catalog-job-progress";
import {
  buildCatalogCursor,
  calculateCatalogPercent,
  CATALOG_STALE_IDLE_MS,
  displayProcessedModels,
  parseCatalogProgressSnapshot,
} from "@/server/catalog/catalog-progress";
import {
  createCatalogEnrichmentRun,
  finishCatalogEnrichmentRun,
  getCatalogJobState,
  getCurrentEnrichingCatalogEntry,
  getLatestCatalogEnrichmentRun,
  isCatalogEnrichmentRunning,
  listCatalogEntryIdsForEnrichment,
  reconcileStaleCatalogRuns,
  updateCatalogEnrichmentProgress,
} from "@/server/repositories/catalog-repository";
import { getAppSettings } from "@/server/repositories/devices-repository";
import { subscribeCatalogUpdate } from "@/server/shared/live-hub";
import { waitUntil } from "@/server/shared/long-poll";
import { createLogger } from "@/server/shared/logger";
import type { CatalogEnrichmentStatusResponse, CatalogJobStage } from "@/shared/types/catalog";

const catalog_log = createLogger("catalog-manager");

let is_enriching = false;

async function expireIdleCatalogStateIfNeeded(): Promise<void> {
  const stored = await getCatalogJobState();
  if (stored?.progress_json) {
    const idle_ms = Date.now() - stored.updatedAt.getTime();
    if (idle_ms < CATALOG_STALE_IDLE_MS) return;
    const snapshot = parseCatalogProgressSnapshot(stored.progress_json);
    const snapshot_busy = Boolean(
      snapshot?.is_running || snapshot?.manual_jobs.some((job) => job.is_running),
    );
    if (!snapshot_busy) return;
  } else {
    const run = await getLatestCatalogEnrichmentRun();
    if (run?.status !== "running") return;
    // Нет снимка — либо джоба ещё не успела записаться, либо это зависший running после рестарта.
    if (Date.now() - run.started_at.getTime() < 90_000) return;
  }

  catalog_log.warn("Сбрасываем зависшее заполнение каталога");
  await reconcileStaleCatalogRuns();
}

export async function getCatalogEnrichmentStatus(): Promise<CatalogEnrichmentStatusResponse> {
  const live = getCatalogLiveProgress();
  const memory_jobs = listCatalogManualJobs();
  const memory_running = is_enriching || live.is_running;
  if (!memory_running && !memory_jobs.some((job) => job.is_running)) {
    await expireIdleCatalogStateIfNeeded();
  }

  const [run, stored, enriching] = await Promise.all([
    getLatestCatalogEnrichmentRun(),
    getCatalogJobState(),
    getCurrentEnrichingCatalogEntry(),
  ]);
  const snapshot = parseCatalogProgressSnapshot(stored?.progress_json);
  const stored_fresh = stored
    ? Date.now() - stored.updatedAt.getTime() < CATALOG_STALE_IDLE_MS
    : false;
  const snapshot_running = Boolean(snapshot?.is_running && stored_fresh);
  const run_recent = Boolean(
    run?.status === "running"
    && Date.now() - run.started_at.getTime() < CATALOG_STALE_IDLE_MS,
  );
  const is_running = memory_running || snapshot_running || run_recent;

  const processed = Math.max(
    live.processed_models,
    snapshot?.processed_models ?? 0,
    run?.processed_models ?? 0,
  );
  const total = Math.max(
    live.total_models,
    snapshot?.total_models ?? 0,
    run?.total_models ?? 0,
  );

  const current_from_memory = memory_running || live.current_entry_id !== null;
  const current = current_from_memory
    ? live
    : snapshot_running && snapshot
      ? snapshot
      : {
          current_entry_id: enriching?.id ?? null,
          current_brand: enriching?.brand ?? null,
          current_model_label: enriching?.model_label || enriching?.model_key || null,
          current_stage: (enriching ? "parts" : "idle") as CatalogJobStage,
          current_source: null,
          current_set_index: null,
          current_set_total: null,
          wait_until_ms: null,
          wait_reason: null,
          message: null,
        };

  const manual_jobs = memory_jobs.length > 0
    ? memory_jobs
    : (snapshot?.manual_jobs ?? []);

  const processed_models = displayProcessedModels({
    is_running,
    processed_models: processed,
    total_models: total,
    has_current: Boolean(current.current_entry_id),
  });

  const payload: CatalogEnrichmentStatusResponse = {
    is_running,
    run_id: live.run_id ?? snapshot?.run_id ?? run?.id ?? null,
    status: run?.status ?? null,
    total_models: total,
    processed_models,
    percent: calculateCatalogPercent({
      is_running,
      processed_models: processed,
      total_models: total,
      current_set_index: current.current_set_index,
      current_set_total: current.current_set_total,
    }),
    started_at: run?.started_at.toISOString() ?? null,
    finished_at: run?.finished_at?.toISOString() ?? null,
    error_message: run?.error_message ?? null,
    current_entry_id: current.current_entry_id,
    current_brand: current.current_brand,
    current_model_label: current.current_model_label,
    current_stage: current.current_stage,
    current_source: current.current_source,
    current_set_index: current.current_set_index,
    current_set_total: current.current_set_total,
    wait_until_ms: current.wait_until_ms,
    wait_reason: current.wait_reason,
    message: current.message,
    manual_jobs,
    cursor: "",
  };
  payload.cursor = buildCatalogCursor(payload);
  return payload;
}

export async function waitForCatalogCursorChange(
  cursor: string,
  timeout_ms: number,
  signal?: AbortSignal,
): Promise<"ready" | "timeout"> {
  if (!cursor) return "ready";
  return waitUntil({
    timeout_ms,
    signal,
    subscribe: subscribeCatalogUpdate,
    is_ready: async () => {
      const status = await getCatalogEnrichmentStatus();
      return status.cursor !== cursor;
    },
  });
}

export async function triggerCatalogEnrichment(options: {
  entry_ids?: number[];
  only_pending?: boolean;
  trigger?: string;
}): Promise<{ started: boolean; message: string }> {
  if (is_enriching || getCatalogLiveProgress().is_running) {
    return { started: false, message: "Обогащение каталога уже выполняется" };
  }

  await expireIdleCatalogStateIfNeeded();
  if (await isCatalogEnrichmentRunning()) {
    return { started: false, message: "Обогащение каталога уже выполняется" };
  }

  const entry_ids = await listCatalogEntryIdsForEnrichment({
    entry_ids: options.entry_ids,
    only_pending: options.only_pending,
  });

  if (entry_ids.length === 0) {
    return { started: false, message: "Нет моделей для обогащения" };
  }

  is_enriching = true;
  const run_id = await createCatalogEnrichmentRun(entry_ids.length, options.trigger ?? "manual");
  startCatalogLiveProgress(run_id, entry_ids.length);

  void (async () => {
    const { seedCatalogStartingData } = await import("@/server/catalog/catalog-seed");
    await seedCatalogStartingData().catch((error) => {
      catalog_log.warn("Не удалось проставить стартовые цены", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    await runEnrichmentLoop(run_id, entry_ids);
  })();

  return {
    started: true,
    message: `Запущено обогащение ${entry_ids.length} моделей`,
  };
}

async function runEnrichmentLoop(run_id: string, entry_ids: number[]): Promise<void> {
  const settings = await getAppSettings();
  let processed = 0;
  let had_error = false;

  catalog_log.info("Старт обогащения каталога", { run_id, total: entry_ids.length });

  try {
    for (const entry_id of entry_ids) {
      const ok = await enrichCatalogEntryById(entry_id, {
        cache_ttl_hours: settings.cache_ttl_hours,
        delay_ms: settings.catalog_source_delay_ms,
        include_allegro: settings.allegro_parts_auto_enabled,
        antibot_wait_seconds: settings.catalog_antibot_wait_seconds,
        antibot_retries: settings.catalog_antibot_retries,
        on_progress: (patch) => {
          patchCatalogLiveProgress({
            ...patch,
            processed_models: processed,
            total_models: entry_ids.length,
            is_running: true,
          });
        },
      });
      if (!ok) had_error = true;
      processed += 1;
      patchCatalogLiveProgress({ processed_models: processed });
      await updateCatalogEnrichmentProgress(run_id, processed);
    }

    await finishCatalogEnrichmentRun(
      run_id,
      "completed",
      had_error ? "Часть моделей завершилась с ошибкой" : undefined,
    );
    catalog_log.info("Обогащение каталога завершено", { run_id, processed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    catalog_log.error("Критическая ошибка обогащения", { run_id }, error);
    await finishCatalogEnrichmentRun(run_id, "failed", message);
  } finally {
    is_enriching = false;
    finishCatalogLiveProgress();
  }
}
