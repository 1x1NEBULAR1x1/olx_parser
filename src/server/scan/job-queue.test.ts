import { describe, expect, it } from "vitest";
import { createJobQueue } from "./job-queue";

describe("createJobQueue", () => {
  it("выполняет задачи последовательно в порядке enqueue", async () => {
    const order: string[] = [];
    const queue = createJobQueue({
      kimovil_prefetch: async (payload) => {
        order.push(String((payload as { model: string }).model));
        await Promise.resolve();
      },
    });

    const first = queue.enqueue("kimovil_prefetch", { model: "a" });
    const second = queue.enqueue("kimovil_prefetch", { model: "b" });
    await Promise.all([first, second]);
    await queue.waitUntilIdle();

    expect(order).toEqual(["a", "b"]);
    expect(queue.stats()).toMatchObject({ completed: 2, failed: 0, queued: 0, running: false });
  });

  it("считает ошибку failed и не останавливает очередь", async () => {
    const queue = createJobQueue({
      kimovil_prefetch: async (payload) => {
        if ((payload as { fail?: boolean }).fail) throw new Error("boom");
      },
    });

    await expect(queue.enqueue("kimovil_prefetch", { fail: true })).rejects.toThrow("boom");
    await queue.enqueue("kimovil_prefetch", { fail: false });

    expect(queue.stats()).toMatchObject({ completed: 1, failed: 1 });
  });

  it("подхватывает задачу, поставленную во время выполнения предыдущей", async () => {
    const queue = createJobQueue({
      kimovil_prefetch: async (payload) => {
        const delay_ms = Number((payload as { delay_ms?: number }).delay_ms ?? 0);
        if (delay_ms) await new Promise((resolve) => setTimeout(resolve, delay_ms));
      },
    });

    const first = queue.enqueue("kimovil_prefetch", { delay_ms: 40 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = queue.enqueue("kimovil_prefetch", { delay_ms: 0 });
    await Promise.all([first, second]);
    await queue.waitUntilIdle();

    expect(queue.stats()).toMatchObject({ completed: 2, failed: 0, running: false });
  });
});
