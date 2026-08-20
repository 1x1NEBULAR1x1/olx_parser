import { describe, expect, it } from "vitest";
import { clampLongPollTimeout, LongPollAbortError, waitUntil } from "./long-poll";

describe("clampLongPollTimeout", () => {
  it("зажимает в 1–25 секунд", () => {
    expect(clampLongPollTimeout(0)).toBe(25_000);
    expect(clampLongPollTimeout(500)).toBe(1_000);
    expect(clampLongPollTimeout(60_000)).toBe(25_000);
    expect(clampLongPollTimeout(Number.NaN)).toBe(25_000);
  });
});

describe("waitUntil", () => {
  it("сразу ready, если условие уже выполнено", async () => {
    const result = await waitUntil({
      is_ready: () => true,
      timeout_ms: 200,
    });
    expect(result).toBe("ready");
  });

  it("возвращает timeout, если событие не пришло", async () => {
    const result = await waitUntil({
      is_ready: () => false,
      timeout_ms: 40,
      tick_ms: 15,
    });
    expect(result).toBe("timeout");
  });

  it("просыпается по subscribe", async () => {
    let ready = false;
    const listeners: Array<() => void> = [];

    const pending = waitUntil({
      is_ready: () => ready,
      timeout_ms: 400,
      tick_ms: 200,
      subscribe: (listener) => {
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 15));
    ready = true;
    listeners.forEach((listener) => listener());

    await expect(pending).resolves.toBe("ready");
  });

  it("абортится вместе с сигналом", async () => {
    const controller = new AbortController();
    const pending = waitUntil({
      is_ready: () => false,
      timeout_ms: 400,
      tick_ms: 200,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(LongPollAbortError);
  });
});
