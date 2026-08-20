import { describe, expect, it } from "vitest";
import { calculateScanPercent } from "@/server/scan/scan-progress";

describe("calculateScanPercent", () => {
  it("returns 100 only when the scan is completed", () => {
    expect(calculateScanPercent({
      status: "completed",
      stage: "saving",
      total_listings: 400,
      processed_listings: 400,
    })).toBe(100);
    expect(calculateScanPercent({
      status: "failed",
      stage: "analyzing",
      total_listings: 400,
      processed_listings: 200,
    })).toBe(0);
  });

  it("moves fetching by elapsed time when listing totals are still unknown", () => {
    const early = calculateScanPercent({
      status: "running",
      stage: "fetching_listings",
      total_listings: null,
      processed_listings: 0,
      stage_elapsed_ms: 2_000,
    });
    const later = calculateScanPercent({
      status: "running",
      stage: "fetching_listings",
      total_listings: null,
      processed_listings: 0,
      stage_elapsed_ms: 10_000,
    });
    expect(early).toBeGreaterThanOrEqual(1);
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThan(10);
  });

  it("uses fetched page counts during fetching_listings when totals are known", () => {
    expect(calculateScanPercent({
      status: "running",
      stage: "fetching_listings",
      total_listings: 10,
      processed_listings: 5,
    })).toBe(6);
  });

  it("creeps analyzing percent between listing ticks", () => {
    const snapped = calculateScanPercent({
      status: "running",
      stage: "analyzing",
      total_listings: 20,
      processed_listings: 10,
    });
    const creeping = calculateScanPercent({
      status: "running",
      stage: "analyzing",
      total_listings: 20,
      processed_listings: 10,
      item_elapsed_ms: 450,
    });
    expect(creeping).toBeGreaterThan(snapped);
    expect(creeping).toBeLessThan(48);
  });

  it("maps analyzing 0/400 to the start of the analyzing band and 400/400 near finalize", () => {
    expect(calculateScanPercent({
      status: "running",
      stage: "analyzing",
      total_listings: 400,
      processed_listings: 0,
    })).toBe(10);
    expect(calculateScanPercent({
      status: "running",
      stage: "analyzing",
      total_listings: 400,
      processed_listings: 200,
    })).toBe(42);
    expect(calculateScanPercent({
      status: "running",
      stage: "analyzing",
      total_listings: 400,
      processed_listings: 400,
    })).toBe(74);
  });
});
