import { describe, expect, it } from "vitest";
import { isCoordinatorLockHeld } from "@/server/repositories/scan-coordinator-repository";

const now = new Date("2026-08-16T00:00:00.000Z");
const future = new Date("2026-08-16T01:00:00.000Z");
const past = new Date("2026-08-15T23:00:00.000Z");

describe("isCoordinatorLockHeld", () => {
  it("ignores a lock whose ScanRun is already failed or missing", () => {
    const current = {
      is_scan_active: true,
      locked_until: future,
      active_scan_id: "scan_old",
    };
    expect(isCoordinatorLockHeld(current, now, "failed")).toBe(false);
    expect(isCoordinatorLockHeld(current, now, "completed")).toBe(false);
    expect(isCoordinatorLockHeld(current, now, null)).toBe(false);
  });

  it("keeps a lock only while the ScanRun is running and not expired", () => {
    const current = {
      is_scan_active: true,
      locked_until: future,
      active_scan_id: "scan_live",
    };
    expect(isCoordinatorLockHeld(current, now, "running")).toBe(true);
    expect(isCoordinatorLockHeld({ ...current, locked_until: past }, now, "running")).toBe(false);
    expect(isCoordinatorLockHeld({ ...current, is_scan_active: false }, now, "running")).toBe(false);
  });
});
