const BUSY_PATTERN = /database is locked|SQLITE_BUSY|P1008/i;

export function isSqliteBusyError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return BUSY_PATTERN.test(message);
}

export async function retryOnSqliteBusy<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; base_delay_ms?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const base_delay_ms = options.base_delay_ms ?? 50;
  let last_error: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last_error = error;
      if (!isSqliteBusyError(error) || attempt === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, base_delay_ms * 2 ** attempt));
    }
  }

  throw last_error;
}
