import { prisma } from "@/shared/db/client";
import { getAppSettings } from "@/server/repositories/devices-repository";
import { ensureExpectedScanWarningsPruned } from "@/server/repositories/scan-issues-repository";

export interface ScanDashboardLastScan {
  scan_id: string;
  finished_at: string;
  duration_sec: number | null;
  listings_total: number | null;
  devices_saved: number;
  yield_pct: number;
  issues_count: number;
  warnings_count: number;
  health_pct: number;
  status: string;
  error_message: string | null;
}

export interface ScanDashboardCache {
  model_cache_total: number;
  model_cache_fresh: number;
  parts_cache_total: number;
  parts_cache_fresh: number;
  catalog_total: number;
  catalog_ready: number;
  freshness_pct: number;
  cache_ttl_hours: number;
}

export interface ScanDashboardMarket {
  total_devices: number;
  damaged_count: number;
  undamaged_count: number;
  profitable_count: number;
  high_profit_count: number;
  negotiable_count: number;
  avg_profitability_pct: number | null;
  avg_price_pln: number | null;
  damaged_share_pct: number;
  profitable_share_pct: number;
  high_profit_share_pct: number;
}

export interface ScanDashboardStats {
  last_scan: ScanDashboardLastScan | null;
  cache: ScanDashboardCache;
  market: ScanDashboardMarket;
}

function roundPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export async function getScanDashboardStats(): Promise<ScanDashboardStats> {
  await ensureExpectedScanWarningsPruned();
  const now = new Date();

  const [
    app_settings,
    last_finished_scan,
    device_count,
    damaged_count,
    profitable_count,
    high_profit_count,
    negotiable_count,
    avg_stats,
    model_cache_total,
    model_cache_fresh,
    parts_cache_total,
    parts_cache_fresh,
    catalog_total,
    catalog_ready,
  ] = await Promise.all([
    getAppSettings(),
    prisma.scanRun.findFirst({
      where: { status: { not: "running" } },
      orderBy: { finished_at: "desc" },
    }),
    prisma.device.count(),
    prisma.device.count({ where: { NOT: { damage_types: "[]" } } }),
    prisma.device.count({ where: { profitability_pct: { gt: 0 } } }),
    prisma.device.count({ where: { profitability_pct: { gte: 20 } } }),
    prisma.device.count({ where: { is_negotiable: true } }),
    prisma.device.aggregate({
      _avg: { profitability_pct: true, price_buy: true },
    }),
    prisma.modelCache.count(),
    prisma.modelCache.count({ where: { expires_at: { gt: now } } }),
    prisma.partsCostCache.count(),
    prisma.partsCostCache.count({ where: { expires_at: { gt: now } } }),
    prisma.deviceCatalogEntry.count(),
    prisma.deviceCatalogEntry.count({ where: { enrichment_status: "ready" } }),
  ]);

  const cache_entries_total = model_cache_total + parts_cache_total;
  const cache_entries_fresh = model_cache_fresh + parts_cache_fresh;

  const cache: ScanDashboardCache = {
    model_cache_total,
    model_cache_fresh,
    parts_cache_total,
    parts_cache_fresh,
    catalog_total,
    catalog_ready,
    freshness_pct: roundPct(cache_entries_fresh, cache_entries_total),
    cache_ttl_hours: app_settings.cache_ttl_hours,
  };

  const market: ScanDashboardMarket = {
    total_devices: device_count,
    damaged_count,
    undamaged_count: Math.max(0, device_count - damaged_count),
    profitable_count,
    high_profit_count,
    negotiable_count,
    avg_profitability_pct: avg_stats._avg.profitability_pct !== null
      ? Math.round(avg_stats._avg.profitability_pct)
      : null,
    avg_price_pln: avg_stats._avg.price_buy !== null
      ? Math.round(avg_stats._avg.price_buy)
      : null,
    damaged_share_pct: roundPct(damaged_count, device_count),
    profitable_share_pct: roundPct(profitable_count, device_count),
    high_profit_share_pct: roundPct(high_profit_count, device_count),
  };

  let last_scan: ScanDashboardLastScan | null = null;
  if (last_finished_scan?.finished_at) {
    const listings_total = last_finished_scan.total_listings;
    const devices_saved = last_finished_scan.devices_count;
    const issue_total = last_finished_scan.issues_count + last_finished_scan.warnings_count;
    const duration_sec = last_finished_scan.started_at
      ? Math.round(
        (last_finished_scan.finished_at.getTime() - last_finished_scan.started_at.getTime()) / 1000,
      )
      : null;

    last_scan = {
      scan_id: last_finished_scan.id,
      finished_at: last_finished_scan.finished_at.toISOString(),
      duration_sec,
      listings_total,
      devices_saved,
      yield_pct: listings_total && listings_total > 0
        ? roundPct(devices_saved, listings_total)
        : (devices_saved > 0 ? 100 : 0),
      issues_count: last_finished_scan.issues_count,
      warnings_count: last_finished_scan.warnings_count,
      health_pct: listings_total && listings_total > 0
        ? Math.max(0, 100 - roundPct(issue_total, listings_total))
        : Math.max(0, 100 - issue_total),
      status: last_finished_scan.status,
      error_message: last_finished_scan.error_message,
    };
  }

  return { last_scan, cache, market };
}
