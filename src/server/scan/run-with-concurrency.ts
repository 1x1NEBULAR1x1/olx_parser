/**
 * Пул воркеров со скользящим окном конкурентности.
 * Результаты сохраняют исходный порядок items (дырки — undefined, если fn бросил).
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  on_item_done?: () => void,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length);
  let next_index = 0;

  async function worker(): Promise<void> {
    while (next_index < items.length) {
      const current_index = next_index;
      next_index += 1;
      try {
        results[current_index] = await fn(items[current_index]);
      } catch {
        // Ошибка по одному элементу не останавливает остальные воркеры.
      } finally {
        on_item_done?.();
      }
    }
  }

  const worker_count = Math.min(concurrency, items.length);
  if (worker_count === 0) return results;

  await Promise.all(Array.from({ length: worker_count }, () => worker()));
  return results;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeout_ms: number,
  label: string,
  abort_controller?: AbortController,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      abort_controller?.abort();
      reject(new Error(`timeout: ${label} (${timeout_ms}ms)`));
    }, timeout_ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
