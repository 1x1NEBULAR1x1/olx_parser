import type {
  CatalogJobStage,
  CatalogLiveProgress,
  CatalogManualJobProgress,
  CatalogProgressSnapshot,
} from "@/shared/types/catalog";
import { publishCatalogUpdate } from "@/server/shared/live-hub";

const idle_progress: CatalogLiveProgress = {
  is_running: false,
  run_id: null,
  processed_models: 0,
  total_models: 0,
  current_entry_id: null,
  current_brand: null,
  current_model_label: null,
  current_stage: "idle",
  current_source: null,
  current_set_index: null,
  current_set_total: null,
  wait_until_ms: null,
  wait_reason: null,
  message: null,
};

let live_progress: CatalogLiveProgress = { ...idle_progress };
const manual_jobs = new Map<number, CatalogManualJobProgress>();
let persist_timer: ReturnType<typeof setTimeout> | null = null;
let publish_timer: ReturnType<typeof setTimeout> | null = null;
let last_publish_at = 0;
const PUBLISH_MIN_INTERVAL_MS = 1_000;

function notifyCatalogWaiters(immediate = false): void {
  if (immediate) {
    if (publish_timer) {
      clearTimeout(publish_timer);
      publish_timer = null;
    }
    last_publish_at = Date.now();
    publishCatalogUpdate();
    return;
  }

  const elapsed = Date.now() - last_publish_at;
  if (elapsed >= PUBLISH_MIN_INTERVAL_MS) {
    last_publish_at = Date.now();
    publishCatalogUpdate();
    return;
  }

  if (!publish_timer) {
    publish_timer = setTimeout(() => {
      publish_timer = null;
      last_publish_at = Date.now();
      publishCatalogUpdate();
    }, PUBLISH_MIN_INTERVAL_MS - elapsed);
  }
}

function buildSnapshot(): CatalogProgressSnapshot {
  return {
    ...live_progress,
    manual_jobs: listCatalogManualJobs(),
  };
}

function schedulePersist(immediate = false): void {
  const flush = () => {
    persist_timer = null;
    void import("@/server/repositories/catalog-repository").then(({ upsertCatalogJobState }) => {
      return upsertCatalogJobState(JSON.stringify(buildSnapshot()));
    }).catch(() => undefined);
  };

  if (immediate) {
    if (persist_timer) {
      clearTimeout(persist_timer);
      persist_timer = null;
    }
    flush();
    return;
  }

  if (persist_timer) return;
  persist_timer = setTimeout(flush, 400);
}

function touch(immediate = false): void {
  notifyCatalogWaiters(immediate);
  schedulePersist(immediate);
}

export function getCatalogLiveProgress(): CatalogLiveProgress {
  return { ...live_progress };
}

export function getCatalogProgressSnapshot(): CatalogProgressSnapshot {
  return buildSnapshot();
}

export function startCatalogLiveProgress(run_id: string, total_models: number): void {
  live_progress = {
    ...idle_progress,
    is_running: true,
    run_id,
    total_models,
    current_stage: "repairability",
    message: "prepare",
  };
  touch(true);
}

export function patchCatalogLiveProgress(patch: Partial<CatalogLiveProgress>): void {
  live_progress = { ...live_progress, ...patch };
  touch(false);
}

export function finishCatalogLiveProgress(): void {
  live_progress = {
    ...idle_progress,
    run_id: live_progress.run_id,
    processed_models: live_progress.processed_models,
    total_models: live_progress.total_models,
    current_stage: "done",
  };
  touch(true);
}

export function listCatalogManualJobs(): CatalogManualJobProgress[] {
  return [...manual_jobs.values()].map((job) => ({ ...job }));
}

export function getCatalogManualJob(entry_id: number): CatalogManualJobProgress | null {
  const job = manual_jobs.get(entry_id);
  return job ? { ...job } : null;
}

export function startCatalogManualJob(job: CatalogManualJobProgress): void {
  manual_jobs.set(job.entry_id, { ...job, is_running: true, stage: job.stage || "parts" });
  touch(true);
}

export function patchCatalogManualJob(
  entry_id: number,
  patch: Partial<CatalogManualJobProgress>,
): void {
  const current = manual_jobs.get(entry_id);
  if (!current) return;
  manual_jobs.set(entry_id, { ...current, ...patch });
  touch(false);
}

export function finishCatalogManualJob(
  entry_id: number,
  patch: Partial<CatalogManualJobProgress>,
): void {
  const current = manual_jobs.get(entry_id);
  if (!current) return;
  const finished: CatalogManualJobProgress = {
    ...current,
    ...patch,
    is_running: false,
    wait_until_ms: null,
  };
  manual_jobs.set(entry_id, finished);
  touch(true);
  setTimeout(() => {
    const latest = manual_jobs.get(entry_id);
    if (latest && !latest.is_running) {
      manual_jobs.delete(entry_id);
      touch(true);
    }
  }, 30_000);
}

export function toWaitUntilMs(wait_seconds: number): number {
  return Date.now() + Math.max(0, wait_seconds) * 1000;
}

export function isCatalogJobStage(value: string): value is CatalogJobStage {
  return [
    "idle",
    "repairability",
    "parts",
    "waiting_antibot",
    "saving",
    "done",
    "error",
  ].includes(value);
}
