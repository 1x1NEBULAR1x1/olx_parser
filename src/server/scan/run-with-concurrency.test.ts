import { describe, expect, it } from "vitest";
import { runWithConcurrency, withTimeout } from "./run-with-concurrency";

describe("runWithConcurrency", () => {
  it("сохраняет порядок результатов", async () => {
    const results = await runWithConcurrency(
      [30, 10, 20],
      2,
      async (delay) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return delay;
      },
    );
    expect(results).toEqual([30, 10, 20]);
  });

  it("не роняет пул, если один элемент бросил", async () => {
    const results = await runWithConcurrency(
      [1, 2, 3],
      2,
      async (value) => {
        if (value === 2) throw new Error("boom");
        return value * 10;
      },
    );
    expect(results).toEqual([10, undefined, 30]);
  });
});

describe("withTimeout", () => {
  it("отклоняет промис по таймауту", async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 20, "slow"),
    ).rejects.toThrow(/timeout: slow/);
  });

  it("абортит связанный AbortController", async () => {
    const controller = new AbortController();
    await expect(
      withTimeout(new Promise(() => undefined), 15, "abort-me", controller),
    ).rejects.toThrow(/timeout: abort-me/);
    expect(controller.signal.aborted).toBe(true);
  });
});
