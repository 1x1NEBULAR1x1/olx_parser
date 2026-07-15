export const PROFITABILITY_NORMALIZE_MIN = -20;
export const PROFITABILITY_NORMALIZE_MAX = 100;

export function normalizeProfitability(pct: number | null): number | null {
  if (pct === null) return null;
  const clamped = Math.min(PROFITABILITY_NORMALIZE_MAX, Math.max(PROFITABILITY_NORMALIZE_MIN, pct));
  return ((clamped - PROFITABILITY_NORMALIZE_MIN) / (PROFITABILITY_NORMALIZE_MAX - PROFITABILITY_NORMALIZE_MIN)) * 100;
}

export function getMetricHighlight(value: number | null): "positive" | "negative" | "neutral" | null {
  if (value === null) return null;
  if (value >= 30) return "positive";
  if (value >= 0) return "neutral";
  return "negative";
}
