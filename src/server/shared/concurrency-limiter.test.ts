import { describe, expect, it } from "vitest";
import { createConcurrencyLimiter } from "./concurrency-limiter";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createConcurrencyLimiter", () => {
  it("не стартует больше max_concurrent задач сразу", async () => {
    const schedule = createConcurrencyLimiter(2, 0);
    let in_flight = 0;
    let peak = 0;

    const run = () => schedule(async () => {
      in_flight += 1;
      peak = Math.max(peak, in_flight);
      await sleep(30);
      in_flight -= 1;
    });

    await Promise.all([run(), run(), run(), run(), run()]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("держит min_interval между стартами, не снимая слот заранее", async () => {
    const schedule = createConcurrencyLimiter(4, 40);
    const started_at: number[] = [];

    const run = () => schedule(async () => {
      started_at.push(Date.now());
    });

    await Promise.all([run(), run(), run(), run()]);
    const gaps = started_at.slice(1).map((ts, index) => ts - started_at[index]);
    expect(gaps.every((gap) => gap >= 30)).toBe(true);
  });
});
