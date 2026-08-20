import { prisma } from "@/shared/db/client";
import { retryOnSqliteBusy } from "@/server/shared/sqlite-retry";

export interface ScanIssueInput {
  listing_id?: number | null;
  olx_url?: string | null;
  title?: string | null;
  severity: "error" | "warning";
  kind: string;
  message: string;
}

export interface ScanIssueRow {
  id: number;
  scan_id: string;
  listing_id: number | null;
  olx_url: string | null;
  title: string | null;
  severity: "error" | "warning";
  kind: string;
  message: string;
  created_at: string;
}

export interface ScanRunSummary {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  devices_count: number;
  issues_count: number;
  warnings_count: number;
}

const BATCH_SIZE = 200;
const EXPECTED_SCAN_WARNING_KINDS = [
  "empty_description",
  "repairability_stub",
  "estimate_parts",
] as const;

export class ScanIssueCollector {
  private items: ScanIssueInput[] = [];

  record(input: ScanIssueInput): void {
    this.items.push(input);
  }

  recordError(input: Omit<ScanIssueInput, "severity">): void {
    this.record({ ...input, severity: "error" });
  }

  recordWarning(input: Omit<ScanIssueInput, "severity">): void {
    this.record({ ...input, severity: "warning" });
  }

  getItems(): ScanIssueInput[] {
    return this.items;
  }

  getCounts(): { issues_count: number; warnings_count: number } {
    let issues_count = 0;
    let warnings_count = 0;
    for (const item of this.items) {
      if (item.severity === "error") issues_count += 1;
      else warnings_count += 1;
    }
    return { issues_count, warnings_count };
  }
}

export async function saveScanIssues(scan_id: string, items: ScanIssueInput[]): Promise<void> {
  const expected_kinds = new Set<string>(EXPECTED_SCAN_WARNING_KINDS);
  const persisted = items.filter((item) => !expected_kinds.has(item.kind));

  await retryOnSqliteBusy(async () => {
    if (persisted.length === 0) {
      await prisma.scanRun.update({
        where: { id: scan_id },
        data: { issues_count: 0, warnings_count: 0 },
      });
      return;
    }

    let issues_count = 0;
    let warnings_count = 0;
    for (const item of persisted) {
      if (item.severity === "error") issues_count += 1;
      else warnings_count += 1;
    }

    await prisma.$transaction(async (tx) => {
      await tx.scanIssue.deleteMany({ where: { scan_id } });

      for (let offset = 0; offset < persisted.length; offset += BATCH_SIZE) {
        const chunk = persisted.slice(offset, offset + BATCH_SIZE);
        await tx.scanIssue.createMany({
          data: chunk.map((item) => ({
            scan_id,
            listing_id: item.listing_id ?? null,
            olx_url: item.olx_url ?? null,
            title: item.title ?? null,
            severity: item.severity,
            kind: item.kind,
            message: item.message,
          })),
        });
      }

      await tx.scanRun.update({
        where: { id: scan_id },
        data: { issues_count, warnings_count },
      });
    });
  });
}

let prune_expected_warnings_promise: Promise<void> | null = null;

export async function pruneExpectedScanWarnings(): Promise<void> {
  const deleted = await retryOnSqliteBusy(() => prisma.scanIssue.deleteMany({
    where: { kind: { in: [...EXPECTED_SCAN_WARNING_KINDS] } },
  }));
  if (deleted.count === 0) return;
  await retryOnSqliteBusy(() => recountScanIssueCounts());
}

export async function ensureExpectedScanWarningsPruned(): Promise<void> {
  if (!prune_expected_warnings_promise) {
    prune_expected_warnings_promise = pruneExpectedScanWarnings().catch((error) => {
      prune_expected_warnings_promise = null;
      throw error;
    });
  }
  await prune_expected_warnings_promise;
}

export async function resolveEmptyDescriptionIssues(listing_id: number): Promise<void> {
  const deleted = await prisma.scanIssue.deleteMany({
    where: { listing_id, kind: "empty_description" },
  });
  if (deleted.count === 0) return;
  await recountScanIssueCounts();
}

async function recountScanIssueCounts(): Promise<void> {
  const [scans, grouped] = await Promise.all([
    prisma.scanRun.findMany({ select: { id: true } }),
    prisma.scanIssue.groupBy({
      by: ["scan_id", "severity"],
      _count: { _all: true },
    }),
  ]);

  const counts_by_scan = new Map<string, { issues_count: number; warnings_count: number }>();
  for (const scan of scans) {
    counts_by_scan.set(scan.id, { issues_count: 0, warnings_count: 0 });
  }
  for (const row of grouped) {
    const entry = counts_by_scan.get(row.scan_id);
    if (!entry) continue;
    if (row.severity === "error") entry.issues_count = row._count._all;
    else entry.warnings_count = row._count._all;
  }

  for (const [scan_id, counts] of counts_by_scan) {
    await prisma.scanRun.update({
      where: { id: scan_id },
      data: counts,
    });
  }
}

export async function getRecentScanRuns(limit = 20): Promise<ScanRunSummary[]> {
  await ensureExpectedScanWarningsPruned();

  const rows = await prisma.scanRun.findMany({
    orderBy: { started_at: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      started_at: true,
      finished_at: true,
      devices_count: true,
      issues_count: true,
      warnings_count: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    started_at: row.started_at.toISOString(),
    finished_at: row.finished_at?.toISOString() ?? null,
    devices_count: row.devices_count,
    issues_count: row.issues_count,
    warnings_count: row.warnings_count,
  }));
}

export async function getScanIssuesPage(options: {
  scan_id: string;
  severity?: "error" | "warning";
  offset: number;
  limit: number;
}): Promise<{ items: ScanIssueRow[]; total_count: number }> {
  await ensureExpectedScanWarningsPruned();

  const where = {
    scan_id: options.scan_id,
    ...(options.severity ? { severity: options.severity } : {}),
  };

  const [rows, total_count] = await Promise.all([
    prisma.scanIssue.findMany({
      where,
      orderBy: [{ severity: "asc" }, { created_at: "desc" }],
      skip: options.offset,
      take: options.limit,
    }),
    prisma.scanIssue.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      scan_id: row.scan_id,
      listing_id: row.listing_id,
      olx_url: row.olx_url,
      title: row.title,
      severity: row.severity as "error" | "warning",
      kind: row.kind,
      message: row.message,
      created_at: row.created_at.toISOString(),
    })),
    total_count,
  };
}
