/**
 * Ограничитель параллелизма для сетевых запросов к одному источнику
 * (OLX "Części", Ceneo). Раньше throttle в ceneo-fetcher.ts/olx-parts-fetcher.ts
 * был строго последовательным: "жди слот -> сделай запрос -> жди ответ -> жди
 * следующий слот" — то есть даже свободные соединения простаивали, пока ответ
 * предыдущего запроса не долетит обратно. createConcurrencyLimiter пускает до
 * max_concurrent запросов ОДНОВРЕМЕННО, дополнительно разнося МОМЕНТЫ СТАРТА
 * не чаще min_interval_ms — так исходный сайт не получает залп запросов
 * впритык, но время ответа перестаёт быть узким местом всего пайплайна.
 */
export function createConcurrencyLimiter(max_concurrent: number, min_interval_ms = 0) {
  let active = 0;
  let last_start = 0;
  let wake_timer: ReturnType<typeof setTimeout> | null = null;
  const queue: Array<() => void> = [];

  function scheduleWake(wait_ms: number): void {
    if (wake_timer) return;
    wake_timer = setTimeout(() => {
      wake_timer = null;
      tryRun();
    }, wait_ms);
  }

  function tryRun(): void {
    while (active < max_concurrent && queue.length > 0) {
      const wait = Math.max(0, last_start + min_interval_ms - Date.now());
      if (wait > 0) {
        scheduleWake(wait);
        return;
      }

      const next = queue.shift();
      if (!next) return;
      last_start = Date.now();
      active += 1;
      next();
    }
  }

  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            tryRun();
          });
      });
      tryRun();
    });
  };
}

function mergeAbortSignals(timeout_ms: number, existing?: AbortSignal | null): AbortSignal {
  const timeout_signal = AbortSignal.timeout(timeout_ms);
  if (!existing) return timeout_signal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([existing, timeout_signal]);
  }
  return timeout_signal;
}

/** fetch() с жёстким таймаутом — защищает пайплайн от подвисания на анти-бот
 * страницах/медленных ответах внешнего источника (без этого один "плохой"
 * запрос мог держать всю очередь конкурентности занятой неопределённо долго). */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeout_ms = 8000,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: mergeAbortSignals(timeout_ms, init.signal),
  });
}
