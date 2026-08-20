import { ApiRequestError } from "@/shared/lib/api-error";

export function isAbortError(error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status === 499) return true;
  return (error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError");
}

export async function waitForDocumentVisible(signal: AbortSignal): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const on_abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const on_visibility = () => {
      if (document.visibilityState === "visible") {
        cleanup();
        resolve();
      }
    };
    function cleanup() {
      document.removeEventListener("visibilitychange", on_visibility);
      signal.removeEventListener("abort", on_abort);
    }
    document.addEventListener("visibilitychange", on_visibility);
    signal.addEventListener("abort", on_abort, { once: true });
    if (document.visibilityState === "visible") {
      cleanup();
      resolve();
    }
  });
}

export async function runLongPollLoop(params: {
  signal: AbortSignal;
  poll: (signal: AbortSignal) => Promise<void>;
  retry_delay_ms?: number;
}): Promise<void> {
  let delay_ms = params.retry_delay_ms ?? 1_000;

  while (!params.signal.aborted) {
    try {
      await waitForDocumentVisible(params.signal);
      if (params.signal.aborted) return;
      await params.poll(params.signal);
      delay_ms = params.retry_delay_ms ?? 1_000;
    } catch (error) {
      if (params.signal.aborted || isAbortError(error)) return;
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, delay_ms);
        const on_abort = () => {
          window.clearTimeout(timer);
          resolve();
        };
        params.signal.addEventListener("abort", on_abort, { once: true });
      });
      delay_ms = Math.min(delay_ms * 2, 10_000);
    }
  }
}
