import type {
  CatalogJobStage,
  CatalogManualJobProgress,
  CatalogProgressSnapshot,
} from "@/shared/types/catalog";

export const CATALOG_STALE_IDLE_MS = 15 * 60_000;

export function calculateCatalogPercent(input: {
  is_running: boolean;
  processed_models: number;
  total_models: number;
  current_set_index: number | null;
  current_set_total: number | null;
}): number {
  const total = input.total_models;
  const processed = Math.max(0, input.processed_models);
  if (total <= 0) return 0;
  if (!input.is_running) {
    return processed >= total ? 100 : Math.min(99, Math.round((processed / total) * 100));
  }

  const set_total = input.current_set_total && input.current_set_total > 0
    ? input.current_set_total
    : 1;
  const set_done = Math.max(0, (input.current_set_index ?? 1) - 1);
  const set_frac = Math.min(0.99, set_done / set_total);
  const raw = ((processed + set_frac) / total) * 100;
  return Math.min(99, Math.max(1, Math.round(raw)));
}

export function displayProcessedModels(input: {
  is_running: boolean;
  processed_models: number;
  total_models: number;
  has_current: boolean;
}): number {
  if (!input.is_running || !input.has_current) return input.processed_models;
  if (input.total_models <= 0) return input.processed_models + 1;
  return Math.min(input.total_models, input.processed_models + 1);
}

export function buildCatalogCursor(status: {
  is_running: boolean;
  run_id: string | null;
  processed_models: number;
  current_entry_id: number | null;
  current_stage: string;
  current_source: string | null;
  current_set_index: number | null;
  wait_until_ms: number | null;
  manual_jobs: CatalogManualJobProgress[];
}): string {
  const jobs = status.manual_jobs
    .map((job) => [
      job.entry_id,
      job.is_running ? "1" : "0",
      job.stage,
      job.set_index,
      job.wait_until_ms ?? 0,
    ].join(":"))
    .join(",");
  return [
    status.is_running ? "1" : "0",
    status.run_id ?? "",
    String(status.processed_models),
    String(status.current_entry_id ?? ""),
    status.current_stage,
    status.current_source ?? "",
    String(status.current_set_index ?? 0),
    String(status.wait_until_ms ?? 0),
    jobs,
  ].join("|");
}

export function parseCatalogProgressSnapshot(raw: string | null | undefined): CatalogProgressSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CatalogProgressSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      is_running: Boolean(parsed.is_running),
      run_id: typeof parsed.run_id === "string" ? parsed.run_id : null,
      processed_models: Number(parsed.processed_models) || 0,
      total_models: Number(parsed.total_models) || 0,
      current_entry_id: typeof parsed.current_entry_id === "number" ? parsed.current_entry_id : null,
      current_brand: typeof parsed.current_brand === "string" ? parsed.current_brand : null,
      current_model_label: typeof parsed.current_model_label === "string" ? parsed.current_model_label : null,
      current_stage: isCatalogJobStage(parsed.current_stage) ? parsed.current_stage : "idle",
      current_source: typeof parsed.current_source === "string" ? parsed.current_source : null,
      current_set_index: typeof parsed.current_set_index === "number" ? parsed.current_set_index : null,
      current_set_total: typeof parsed.current_set_total === "number" ? parsed.current_set_total : null,
      wait_until_ms: typeof parsed.wait_until_ms === "number" ? parsed.wait_until_ms : null,
      wait_reason: typeof parsed.wait_reason === "string" ? parsed.wait_reason : null,
      message: typeof parsed.message === "string" ? parsed.message : null,
      manual_jobs: Array.isArray(parsed.manual_jobs) ? parsed.manual_jobs : [],
    };
  } catch {
    return null;
  }
}

function isCatalogJobStage(value: unknown): value is CatalogJobStage {
  return value === "idle"
    || value === "repairability"
    || value === "parts"
    || value === "waiting_antibot"
    || value === "saving"
    || value === "done"
    || value === "error";
}
