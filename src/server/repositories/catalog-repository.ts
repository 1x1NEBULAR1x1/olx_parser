import { prisma } from "@/shared/db/client";
import type {
  CatalogEnrichmentStatus,
  CatalogNeighborInfo,
  CatalogStorageStat,
  DeviceCatalogDetailResponse,
  DeviceCatalogPatch,
  DeviceCatalogRow,
} from "@/shared/types/catalog";
import { listPartsCachesForModel } from "@/server/repositories/devices-repository";
import { adjustPriceForStorage, resolveStartingMarketPrice } from "@/server/domain/model-market-price-hints";

function parseStoragePrices(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function toCatalogRow(entry: {
  id: number;
  brand: string;
  model_key: string;
  model_label: string;
  model_line: string;
  model_line_label: string;
  model_query: string;
  release_year: number | null;
  repairability_score: number | null;
  repairability_scale: number | null;
  ifixit_device_name: string | null;
  ifixit_url: string | null;
  market_sell_price: number | null;
  market_sell_price_source: string | null;
  manual_repairability_score: number | null;
  manual_repairability_scale: number | null;
  manual_market_sell_price: number | null;
  manual_storage_prices: string | null;
  manual_repair_complexity_pct: number | null;
  lock_repairability: boolean;
  lock_market_price: boolean;
  notes: string | null;
  enrichment_status: string;
  last_enriched_at: Date | null;
  last_enrichment_error: string | null;
  listings_seen_count: number;
}): DeviceCatalogRow {
  return {
    id: entry.id,
    brand: entry.brand,
    model_key: entry.model_key,
    model_label: entry.model_label,
    model_line: entry.model_line,
    model_line_label: entry.model_line_label,
    model_query: entry.model_query,
    release_year: entry.release_year,
    repairability_score: entry.repairability_score,
    repairability_scale: entry.repairability_scale,
    ifixit_device_name: entry.ifixit_device_name,
    ifixit_url: entry.ifixit_url,
    market_sell_price: entry.market_sell_price,
    market_sell_price_source: entry.market_sell_price_source,
    manual_repairability_score: entry.manual_repairability_score,
    manual_repairability_scale: entry.manual_repairability_scale,
    manual_market_sell_price: entry.manual_market_sell_price,
    manual_storage_prices: parseStoragePrices(entry.manual_storage_prices),
    manual_repair_complexity_pct: entry.manual_repair_complexity_pct,
    lock_repairability: entry.lock_repairability,
    lock_market_price: entry.lock_market_price,
    notes: entry.notes,
    enrichment_status: entry.enrichment_status as CatalogEnrichmentStatus,
    last_enriched_at: entry.last_enriched_at?.toISOString() ?? null,
    last_enrichment_error: entry.last_enrichment_error,
    listings_seen_count: entry.listings_seen_count,
  };
}

export async function listCatalogEntries(params: {
  offset?: number;
  limit?: number;
  brand?: string;
  model_line?: string;
  status?: string;
  search?: string;
}): Promise<{
  items: DeviceCatalogRow[];
  total_count: number;
  brands: string[];
  model_lines: { value: string; label: string }[];
}> {
  const offset = params.offset ?? 0;
  const limit = Math.min(params.limit ?? 50, 200);
  const where = buildCatalogListWhere(params);

  const [items, total_count, brand_rows, line_rows] = await Promise.all([
    prisma.deviceCatalogEntry.findMany({
      where,
      orderBy: [{ listings_seen_count: "desc" }, { brand: "asc" }, { model_key: "asc" }],
      skip: offset,
      take: limit,
    }),
    prisma.deviceCatalogEntry.count({ where }),
    prisma.deviceCatalogEntry.findMany({
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    prisma.deviceCatalogEntry.findMany({
      where: {
        ...(params.brand ? { brand: params.brand } : {}),
        NOT: { model_line: "" },
      },
      distinct: ["model_line"],
      select: { model_line: true, model_line_label: true },
      orderBy: { model_line_label: "asc" },
    }),
  ]);

  const model_lines_map = new Map<string, string>();
  for (const row of line_rows) {
    if (!row.model_line) continue;
    model_lines_map.set(row.model_line, row.model_line_label || row.model_line);
  }

  return {
    items: items.map(toCatalogRow),
    total_count,
    brands: brand_rows.map((row) => row.brand),
    model_lines: [...model_lines_map.entries()].map(([value, label]) => ({ value, label })),
  };
}

export async function listCatalogEntryIdsForFilters(params: {
  brand?: string;
  model_line?: string;
  status?: string;
  search?: string;
  limit?: number;
}): Promise<number[]> {
  const take = Math.min(params.limit ?? 500, 500);
  const rows = await prisma.deviceCatalogEntry.findMany({
    where: buildCatalogListWhere(params),
    orderBy: [{ listings_seen_count: "desc" }, { id: "asc" }],
    select: { id: true },
    take,
  });
  return rows.map((row) => row.id);
}

function buildCatalogListWhere(params: {
  brand?: string;
  model_line?: string;
  status?: string;
  search?: string;
}) {
  const search = params.search?.trim();
  return {
    ...(params.brand ? { brand: params.brand } : {}),
    ...(params.model_line ? { model_line: params.model_line } : {}),
    ...(params.status ? { enrichment_status: params.status } : {}),
    ...(search
      ? {
          OR: [
            { model_key: { contains: search } },
            { model_label: { contains: search } },
            { model_query: { contains: search } },
            { brand: { contains: search } },
            { model_line: { contains: search } },
            { model_line_label: { contains: search } },
          ],
        }
      : {}),
  };
}

export async function getCatalogEntryById(id: number): Promise<DeviceCatalogRow | null> {
  const entry = await prisma.deviceCatalogEntry.findUnique({ where: { id } });
  return entry ? toCatalogRow(entry) : null;
}

export async function getCatalogEntryByKey(
  brand: string,
  model_key: string,
): Promise<DeviceCatalogRow | null> {
  const entry = await prisma.deviceCatalogEntry.findUnique({
    where: { brand_model_key: { brand, model_key } },
  });
  return entry ? toCatalogRow(entry) : null;
}

export async function listAllCatalogEntries(): Promise<DeviceCatalogRow[]> {
  const entries = await prisma.deviceCatalogEntry.findMany();
  return entries.map(toCatalogRow);
}

export interface CatalogUpsertInput {
  brand: string;
  model_key: string;
  model_label?: string;
  model_line?: string;
  model_line_label?: string;
  model_query?: string;
  release_year?: number | null;
  listings_seen_delta?: number;
}

export async function upsertCatalogFromDevice(input: CatalogUpsertInput): Promise<void> {
  const existing = await prisma.deviceCatalogEntry.findUnique({
    where: { brand_model_key: { brand: input.brand, model_key: input.model_key } },
  });

  if (existing) {
    await prisma.deviceCatalogEntry.update({
      where: { id: existing.id },
      data: {
        model_label: input.model_label ?? existing.model_label,
        model_line: input.model_line ?? existing.model_line,
        model_line_label: input.model_line_label ?? existing.model_line_label,
        model_query: input.model_query ?? existing.model_query,
        release_year: input.release_year ?? existing.release_year,
        listings_seen_count: existing.listings_seen_count + (input.listings_seen_delta ?? 1),
        enrichment_status: existing.enrichment_status === "ready" ? "stale" : existing.enrichment_status,
      },
    });
    return;
  }

  await prisma.deviceCatalogEntry.create({
    data: {
      brand: input.brand,
      model_key: input.model_key,
      model_label: input.model_label ?? "",
      model_line: input.model_line ?? "",
      model_line_label: input.model_line_label ?? "",
      model_query: input.model_query ?? input.model_key,
      release_year: input.release_year ?? null,
      listings_seen_count: input.listings_seen_delta ?? 1,
      enrichment_status: "pending",
    },
  });
}

export async function patchCatalogEntry(
  id: number,
  patch: DeviceCatalogPatch,
): Promise<DeviceCatalogRow | null> {
  try {
    const { manual_storage_prices, ...rest } = patch;
    const entry = await prisma.deviceCatalogEntry.update({
      where: { id },
      data: {
        ...rest,
        ...(manual_storage_prices !== undefined
          ? { manual_storage_prices: manual_storage_prices ? JSON.stringify(manual_storage_prices) : null }
          : {}),
      },
    });
    return toCatalogRow(entry);
  } catch {
    return null;
  }
}

export async function updateCatalogEnrichmentResult(
  id: number,
  patch: {
    repairability_score?: number | null;
    repairability_scale?: number | null;
    ifixit_device_name?: string | null;
    ifixit_url?: string | null;
    market_sell_price?: number | null;
    market_sell_price_source?: string | null;
    release_year?: number | null;
    enrichment_status: CatalogEnrichmentStatus;
    last_enrichment_error?: string | null;
  },
): Promise<void> {
  await prisma.deviceCatalogEntry.update({
    where: { id },
    data: {
      ...patch,
      last_enriched_at: new Date(),
    },
  });
}

export async function listCatalogEntryIdsForEnrichment(params: {
  only_pending?: boolean;
  entry_ids?: number[];
}): Promise<number[]> {
  if (params.entry_ids?.length) {
    return params.entry_ids;
  }

  const where = params.only_pending
    ? { enrichment_status: { in: ["pending", "stale", "error"] } }
    : {};

  const rows = await prisma.deviceCatalogEntry.findMany({
    where,
    orderBy: [{ listings_seen_count: "desc" }, { id: "asc" }],
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

export async function createCatalogEnrichmentRun(
  total_models: number,
  trigger: string,
): Promise<string> {
  const run = await prisma.catalogEnrichmentRun.create({
    data: { status: "running", total_models, trigger },
  });
  return run.id;
}

export async function updateCatalogEnrichmentProgress(
  run_id: string,
  processed_models: number,
): Promise<void> {
  await prisma.catalogEnrichmentRun.update({
    where: { id: run_id },
    data: { processed_models },
  });
}

export async function finishCatalogEnrichmentRun(
  run_id: string,
  status: "completed" | "failed",
  error_message?: string,
): Promise<void> {
  await prisma.catalogEnrichmentRun.update({
    where: { id: run_id },
    data: {
      status,
      finished_at: new Date(),
      error_message: error_message ?? null,
    },
  });
}

export async function getLatestCatalogEnrichmentRun() {
  return prisma.catalogEnrichmentRun.findFirst({ orderBy: { started_at: "desc" } });
}

export async function isCatalogEnrichmentRunning(): Promise<boolean> {
  const run = await getLatestCatalogEnrichmentRun();
  return run?.status === "running";
}

export async function upsertCatalogJobState(progress_json: string): Promise<void> {
  await prisma.catalogJobState.upsert({
    where: { id: 1 },
    create: { id: 1, progress_json },
    update: { progress_json },
  });
}

export async function getCatalogJobState(): Promise<{
  progress_json: string | null;
  updatedAt: Date;
} | null> {
  return prisma.catalogJobState.findUnique({ where: { id: 1 } });
}

export async function getCurrentEnrichingCatalogEntry(): Promise<{
  id: number;
  brand: string;
  model_label: string;
  model_key: string;
} | null> {
  return prisma.deviceCatalogEntry.findFirst({
    where: { enrichment_status: "enriching" },
    select: { id: true, brand: true, model_label: true, model_key: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function reconcileStaleCatalogRuns(): Promise<number> {
  const result = await prisma.catalogEnrichmentRun.updateMany({
    where: { status: "running" },
    data: {
      status: "failed",
      finished_at: new Date(),
      error_message: "Прервано: процесс перезапущен",
    },
  });
  await prisma.deviceCatalogEntry.updateMany({
    where: { enrichment_status: "enriching" },
    data: { enrichment_status: "pending" },
  });
  await prisma.catalogJobState.upsert({
    where: { id: 1 },
    create: { id: 1, progress_json: null },
    update: { progress_json: null },
  });
  return result.count;
}

export async function syncCatalogFromLatestDevices(): Promise<number> {
  const latest_scan = await prisma.scanRun.findFirst({
    where: { status: "completed" },
    orderBy: { started_at: "desc" },
    include: {
      devices: {
        select: {
          brand: true,
          model_key: true,
          model_label: true,
          model_line: true,
          model_line_label: true,
          model_query: true,
          release_year: true,
        },
      },
    },
  });

  if (!latest_scan) return 0;

  const seen = new Map<string, CatalogUpsertInput>();
  for (const device of latest_scan.devices) {
    if (!device.model_key) continue;
    const key = `${device.brand}::${device.model_key}`;
    const prev = seen.get(key);
    seen.set(key, {
      brand: device.brand,
      model_key: device.model_key,
      model_label: device.model_label,
      model_line: device.model_line,
      model_line_label: device.model_line_label,
      model_query: device.model_query,
      release_year: device.release_year,
      listings_seen_delta: (prev?.listings_seen_delta ?? 0) + 1,
    });
  }

  for (const input of seen.values()) {
    const count = input.listings_seen_delta ?? 1;
    await prisma.deviceCatalogEntry.upsert({
      where: { brand_model_key: { brand: input.brand, model_key: input.model_key } },
      update: {
        model_label: input.model_label ?? "",
        model_line: input.model_line ?? "",
        model_line_label: input.model_line_label ?? "",
        model_query: input.model_query ?? input.model_key,
        release_year: input.release_year ?? null,
        listings_seen_count: { increment: count },
      },
      create: {
        brand: input.brand,
        model_key: input.model_key,
        model_label: input.model_label ?? "",
        model_line: input.model_line ?? "",
        model_line_label: input.model_line_label ?? "",
        model_query: input.model_query ?? input.model_key,
        release_year: input.release_year ?? null,
        listings_seen_count: count,
        enrichment_status: "pending",
      },
    });
  }

  const { seedCatalogStartingData } = await import("@/server/catalog/catalog-seed");
  await seedCatalogStartingData();

  return seen.size;
}

export async function getCatalogNeighbors(
  id: number,
  params: {
    brand?: string;
    model_line?: string;
    status?: string;
    search?: string;
  },
): Promise<CatalogNeighborInfo> {
  const rows = await prisma.deviceCatalogEntry.findMany({
    where: buildCatalogListWhere(params),
    orderBy: [{ listings_seen_count: "desc" }, { brand: "asc" }, { model_key: "asc" }],
    select: { id: true },
  });
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) {
    return { prev_id: null, next_id: null, index: 0, total: rows.length };
  }
  return {
    prev_id: rows[index - 1]?.id ?? null,
    next_id: rows[index + 1]?.id ?? null,
    index: index + 1,
    total: rows.length,
  };
}

export async function getCatalogDeviceDetail(
  id: number,
  filters?: {
    brand?: string;
    model_line?: string;
    status?: string;
    search?: string;
  },
): Promise<DeviceCatalogDetailResponse | null> {
  const entry = await getCatalogEntryById(id);
  if (!entry) return null;

  const devices = await prisma.device.findMany({
    where: { brand: entry.brand, model_key: entry.model_key },
    select: { storage_gb: true, price_buy: true },
  });

  const by_storage = new Map<number, number[]>();
  for (const device of devices) {
    const storage = device.storage_gb ?? 128;
    const bucket = by_storage.get(storage) ?? [];
    if (device.price_buy !== null) bucket.push(device.price_buy);
    by_storage.set(storage, bucket);
  }

  const storage_keys = new Set<number>([64, 128, 256, 512, 1024, ...by_storage.keys()]);
  const hint_128 = resolveStartingMarketPrice(entry.brand, entry.model_key, 128);
  const storage_stats: CatalogStorageStat[] = [...storage_keys]
    .sort((a, b) => a - b)
    .map((storage_gb) => {
      const prices = by_storage.get(storage_gb) ?? [];
      const sorted = [...prices].sort((a, b) => a - b);
      const median_buy = sorted.length === 0
        ? null
        : sorted.length % 2 === 1
          ? sorted[Math.floor(sorted.length / 2)]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      return {
        storage_gb,
        listing_count: prices.length,
        median_buy: median_buy !== null ? Math.round(median_buy) : null,
        hint_price: hint_128 !== null ? adjustPriceForStorage(hint_128, storage_gb) : null,
        manual_price: entry.manual_storage_prices?.[String(storage_gb)] ?? null,
      };
    });

  const [parts_caches, brand_rows, neighbors] = await Promise.all([
    listPartsCachesForModel(entry.brand, entry.model_key),
    prisma.deviceCatalogEntry.findMany({
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    getCatalogNeighbors(id, filters ?? {}),
  ]);

  return {
    item: entry,
    storage_stats,
    parts_caches,
    brands: brand_rows.map((row) => row.brand),
    neighbors,
  };
}
