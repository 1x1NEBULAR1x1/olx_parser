import { describe, expect, it } from "vitest";
import {
  deriveUiOutcome,
  resolveScanOutcome,
  shouldReplaceFeed,
} from "./scan-outcome";

describe("shouldReplaceFeed", () => {
  it("разрешает первую ленту, если есть объявления", () => {
    expect(shouldReplaceFeed(10, 0)).toBe(true);
    expect(shouldReplaceFeed(0, 0)).toBe(false);
  });

  it("не затирает прошлую ленту пустым набором", () => {
    expect(shouldReplaceFeed(0, 100)).toBe(false);
  });

  it("не затирает ленту аномально маленьким набором", () => {
    expect(shouldReplaceFeed(10, 400)).toBe(false);
    expect(shouldReplaceFeed(80, 400)).toBe(true);
  });

  it("при короткой прошлой ленте (<20) не считает усадку сбоем OLX", () => {
    expect(shouldReplaceFeed(10, 19)).toBe(true);
    expect(shouldReplaceFeed(1, 10)).toBe(true);
  });
});

describe("resolveScanOutcome", () => {
  it("failed + previous_snapshot, если fetch пустой", () => {
    const outcome = resolveScanOutcome({
      stats: {
        listings_fetched: 0,
        previous_count: 120,
        reused: 0,
        full: 0,
        lightweight: 0,
        lightweight_fallback: 0,
        skipped: 0,
        fetch_partial: true,
      },
      fetch_error_message: "OLX HTTP 403",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.should_replace_feed).toBe(false);
    expect(outcome.source).toBe("previous_snapshot");
    expect(outcome.message).toContain("403");
  });

  it("degraded, если часть страниц упала, но набор достаточный", () => {
    const outcome = resolveScanOutcome({
      stats: {
        listings_fetched: 200,
        previous_count: 220,
        reused: 150,
        full: 40,
        lightweight: 10,
        lightweight_fallback: 3,
        skipped: 1,
        fetch_partial: true,
      },
    });
    expect(outcome.status).toBe("degraded");
    expect(outcome.should_replace_feed).toBe(true);
    expect(outcome.source).toBe("partial");
  });

  it("ok на полном успешном прогоне", () => {
    const outcome = resolveScanOutcome({
      stats: {
        listings_fetched: 400,
        previous_count: 390,
        reused: 300,
        full: 80,
        lightweight: 20,
        lightweight_fallback: 0,
        skipped: 0,
        fetch_partial: false,
      },
    });
    expect(outcome).toMatchObject({
      status: "ok",
      source: "fresh",
      should_replace_feed: true,
      message: null,
    });
  });
});

describe("deriveUiOutcome", () => {
  it("failed скан = оставляем предыдущую ленту", () => {
    expect(deriveUiOutcome({
      scan_status: "failed",
      error_message: "timeout",
      issues_count: 0,
      warnings_count: 0,
    })).toEqual({ outcome_status: "failed", kept_previous_feed: true });
  });

  it("completed с предупреждениями = degraded", () => {
    expect(deriveUiOutcome({
      scan_status: "completed",
      error_message: null,
      issues_count: 0,
      warnings_count: 4,
    }).outcome_status).toBe("degraded");
  });
});
