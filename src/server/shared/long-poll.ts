export const LONG_POLL_DEFAULT_TIMEOUT_MS = 25_000;
export const LONG_POLL_MAX_TIMEOUT_MS = 25_000;
export const LONG_POLL_MIN_TIMEOUT_MS = 1_000;
export const LONG_POLL_TICK_MS = 1_000;

export function clampLongPollTimeout(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return LONG_POLL_DEFAULT_TIMEOUT_MS;
  return Math.min(LONG_POLL_MAX_TIMEOUT_MS, Math.max(LONG_POLL_MIN_TIMEOUT_MS, Math.floor(raw)));
}

export class LongPollAbortError extends Error {
  constructor() {
    super("long-poll aborted");
    this.name = "LongPollAbortError";
  }
}

/**
 * Держит запрос, пока isReady() не станет true, не выйдет timeout
 * или клиент не отключится. subscribe — быстрый путь (in-memory event);
 * tick_ms страхует, если событие пришло в другом инстансе модуля (next dev).
 */
export async function waitUntil(params: {
  is_ready: () => boolean | Promise<boolean>;
  subscribe?: (wake: () => void) => () => void;
  timeout_ms?: number;
  tick_ms?: number;
  signal?: AbortSignal;
}): Promise<"ready" | "timeout"> {
  const timeout_ms = params.timeout_ms ?? LONG_POLL_DEFAULT_TIMEOUT_MS;
  const tick_ms = params.tick_ms ?? LONG_POLL_TICK_MS;

  if (params.signal?.aborted) throw new LongPollAbortError();
  if (await params.is_ready()) return "ready";

  return new Promise<"ready" | "timeout">((resolve, reject) => {
    let settled = false;
    let tick_timer: ReturnType<typeof setTimeout> | null = null;
    let timeout_timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const settle = (result: "ready" | "timeout") => {
      if (settled) return;
      settled = true;
      if (tick_timer) clearTimeout(tick_timer);
      if (timeout_timer) clearTimeout(timeout_timer);
      unsubscribe?.();
      params.signal?.removeEventListener("abort", on_abort);
      resolve(result);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      if (tick_timer) clearTimeout(tick_timer);
      if (timeout_timer) clearTimeout(timeout_timer);
      unsubscribe?.();
      params.signal?.removeEventListener("abort", on_abort);
      reject(error);
    };

    const on_abort = () => fail(new LongPollAbortError());

    if (params.signal?.aborted) {
      fail(new LongPollAbortError());
      return;
    }

    const check = () => {
      void Promise.resolve()
        .then(() => params.is_ready())
        .then((ready) => {
          if (ready) settle("ready");
        })
        .catch(fail);
    };

    const scheduleTick = () => {
      tick_timer = setTimeout(() => {
        if (settled) return;
        check();
        if (!settled) scheduleTick();
      }, tick_ms);
    };

    params.signal?.addEventListener("abort", on_abort, { once: true });
    unsubscribe = params.subscribe?.(check) ?? null;
    timeout_timer = setTimeout(() => settle("timeout"), timeout_ms);
    scheduleTick();
  });
}
