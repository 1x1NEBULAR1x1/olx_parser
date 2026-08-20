export const SCAN_STAGE_WEIGHTS = {
  fetching_listings: { from: 1, to: 10, typical_ms: 18_000 },
  analyzing: { from: 10, to: 74 },
  finalizing: { from: 74, to: 88 },
  saving: { from: 88, to: 99 },
} as const;

export type ScanProgressStage = keyof typeof SCAN_STAGE_WEIGHTS;

export interface ScanPercentInput {
  status: string;
  stage: string | null;
  total_listings: number | null;
  processed_listings: number;
  stage_elapsed_ms?: number;
  item_elapsed_ms?: number;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(99, Math.round(value)));
}

function ratioFromCounts(processed: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(1, Math.max(0, processed / total));
}

/**
 * Доля стадии: сначала processed/total, иначе оценка по времени
 * (чтобы полоска ехала каждую секунду, пока OLX ещё грузит список).
 */
const TYPICAL_ITEM_MS: Record<ScanProgressStage, number> = {
  fetching_listings: 1_400,
  analyzing: 450,
  finalizing: 180,
  saving: 80,
};

export function resolveStageRatio(
  stage: ScanProgressStage,
  processed_listings: number,
  total_listings: number | null,
  stage_elapsed_ms = 0,
  item_elapsed_ms = 0,
): number {
  const counted = ratioFromCounts(processed_listings, total_listings);
  if (counted !== null) {
    if (!total_listings || processed_listings >= total_listings) return counted;
    const extra = Math.min(0.8, item_elapsed_ms / TYPICAL_ITEM_MS[stage]);
    return Math.min(1, (processed_listings + extra) / total_listings);
  }

  if (stage === "fetching_listings") {
    const typical = SCAN_STAGE_WEIGHTS.fetching_listings.typical_ms;
    return Math.min(0.9, stage_elapsed_ms / typical);
  }

  return 0;
}

export function calculateScanPercent(input: ScanPercentInput): number {
  if (input.status === "completed") return 100;
  if (input.status !== "running") return 0;

  const stage = input.stage as ScanProgressStage | null;
  if (!stage || !(stage in SCAN_STAGE_WEIGHTS)) return 1;

  const { from, to } = SCAN_STAGE_WEIGHTS[stage];
  const ratio = resolveStageRatio(
    stage,
    input.processed_listings,
    input.total_listings,
    input.stage_elapsed_ms,
    input.item_elapsed_ms,
  );
  return clampPercent(from + ratio * (to - from));
}
