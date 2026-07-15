import type { AnalyzedDevice } from "@/shared/types/domain";
import { isPartEstimate } from "@/server/domain/repair-parts-stubs";
import type { ScanIssueInput } from "@/server/repositories/scan-issues-repository";

export type ScanIssueKind =
  | "listing_timeout"
  | "listing_fetch_failed"
  | "listing_analyze_error"
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
  } else if (!device.ifixit_device_name && device.repairability_score !== null) {
    warnings.push({
      ...base,
      severity: "warning",
      kind: "repairability_stub",
      message: "Ремонтопригодность — оценка по умолчанию, без iFixit",
    });
  }

  if (device.allegro_parts.some((part) => isPartEstimate(part))) {
    warnings.push({
      ...base,
      severity: "warning",
      kind: "estimate_parts",
      message: "Часть цен на запчасти — ориентировочная (★)",
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

  if (!device.post_summary.trim()) {
    warnings.push({
      ...base,
      severity: "warning",
      kind: "empty_description",
      message: "Пустое описание объявления",
    });
  }

  return warnings;
}
