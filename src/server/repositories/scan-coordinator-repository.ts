import { prisma } from "@/shared/db/client";

const COORDINATOR_ID = 1;
const DEFAULT_LOCK_TTL_MS = 120 * 60_000;

export function isCoordinatorLockHeld(
  current: {
    is_scan_active: boolean;
    locked_until: Date | null;
    active_scan_id: string | null;
  },
  now: Date,
  scan_status: string | null,
): boolean {
  if (!current.is_scan_active || !current.locked_until) return false;
  if (current.locked_until <= now) return false;
  return scan_status === "running";
}

async function getActiveScanStatus(scan_id: string | null): Promise<string | null> {
  if (!scan_id) return null;
  const scan = await prisma.scanRun.findUnique({
    where: { id: scan_id },
    select: { status: true },
  });
  return scan?.status ?? null;
}

export async function tryAcquireScanLock(scan_id: string, ttl_ms = DEFAULT_LOCK_TTL_MS): Promise<boolean> {
  const now = new Date();
  const locked_until = new Date(now.getTime() + ttl_ms);

  await prisma.scanCoordinator.upsert({
    where: { id: COORDINATOR_ID },
    update: {},
    create: { id: COORDINATOR_ID, is_scan_active: false },
  });

  const current = await prisma.scanCoordinator.findUnique({ where: { id: COORDINATOR_ID } });
  if (current) {
    const scan_status = await getActiveScanStatus(current.active_scan_id);
    if (
      isCoordinatorLockHeld(current, now, scan_status)
      && current.active_scan_id !== scan_id
    ) {
      return false;
    }
  }

  await prisma.scanCoordinator.update({
    where: { id: COORDINATOR_ID },
    data: {
      is_scan_active: true,
      active_scan_id: scan_id,
      locked_until,
    },
  });

  return true;
}

export async function releaseScanLock(scan_id: string): Promise<void> {
  const current = await prisma.scanCoordinator.findUnique({ where: { id: COORDINATOR_ID } });
  if (!current || current.active_scan_id !== scan_id) return;

  await prisma.scanCoordinator.update({
    where: { id: COORDINATOR_ID },
    data: {
      is_scan_active: false,
      active_scan_id: null,
      locked_until: null,
    },
  });
}

export async function forceReleaseScanLock(): Promise<void> {
  await prisma.scanCoordinator.upsert({
    where: { id: COORDINATOR_ID },
    update: {
      is_scan_active: false,
      active_scan_id: null,
      locked_until: null,
    },
    create: { id: COORDINATOR_ID, is_scan_active: false },
  });
}

export async function isScanLockActive(): Promise<boolean> {
  const current = await prisma.scanCoordinator.findUnique({ where: { id: COORDINATOR_ID } });
  if (!current) return false;
  const scan_status = await getActiveScanStatus(current.active_scan_id);
  return isCoordinatorLockHeld(current, new Date(), scan_status);
}
