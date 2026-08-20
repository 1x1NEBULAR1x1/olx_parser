import type { AnalyzedDevice } from "@/shared/types/domain";
import type { ScanIssueInput } from "@/server/repositories/scan-issues-repository";

export type ScanIssueKind =
  | "listing_timeout"
  | "listing_fetch_failed"
  | "listing_analyze_error"
  | "degraded_to_lightweight"
  | "olx_page_failed"
  | "olx_state_failed"
  | "parts_source_failed"
  | "feed_not_replaced"
  | "missing_repairability"
  | "repairability_stub"
  | "estimate_parts"
  | "missing_parts"
  | "weak_market_price"
  | "missing_market_price"
  | "missing_photos"
  | "empty_description";

export function classifyListingError(message: string): ScanIssueKind {
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return "listing_timeout";
  }
  if (lower.includes("fetch failed")) {
    return "listing_fetch_failed";
  }
  return "listing_analyze_error";
}

/** Рабочие заглушки пайплайна — не сигнал поломки, не пишем в журнал. */
export const EXPECTED_SCAN_WARNING_KINDS = [
  "empty_description",
  "repairability_stub",
  "estimate_parts",
] as const;

export function hasUsableDescription(post_summary: string | null | undefined): boolean {
  if (!post_summary) return false;
  const text = post_summary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 0;
}

export function detectDeviceWarnings(device: AnalyzedDevice): ScanIssueInput[] {
  const warnings: ScanIssueInput[] = [];
  const base = {
    listing_id: device.id,
    olx_url: device.olx_url,
    title: device.title,
  };

  if (!device.ifixit_device_name && device.repairability_score === null) {
    warnings.push({
      ...base,
      severity: "warning",
      kind: "missing_repairability",
      message: "Не найдена ремонтопригодность iFixit",
    });
  }

  if (device.damage_types.length > 0 && (device.parts_cost_estimate === null || device.allegro_parts.length === 0)) {
    warnings.push({
      ...base,
      severity: "warning",
      kind: "missing_parts",
      message: "Не удалось подобрать цены запчастей для повреждений",
    });
  }

  if (device.market_sell_price === null) {
    warnings.push({
      ...base,
      severity: "warning",
      kind: "missing_market_price",
      message: "Не определена ориентировочная цена продажи",
    });
  } else if (device.market_sell_price_source === "brand_estimate") {
    warnings.push({
      ...base,
      severity: "warning",
      kind: "weak_market_price",
      message: "Цена продажи — грубая эвристика по бренду",
    });
  }

  if (device.photos.length === 0) {
    warnings.push({
      ...base,
      severity: "warning",
      kind: "missing_photos",
      message: "Нет фото в объявлении",
    });
  }

  return warnings;
}
