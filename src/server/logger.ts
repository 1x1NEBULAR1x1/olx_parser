type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

function formatMeta(meta?: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [meta: unserializable]";
  }
}

function shouldLogDebug(): boolean {
  const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return level === "debug";
}

export interface Logger {
  debug: (message: string, meta?: LogMeta) => void;
  info: (message: string, meta?: LogMeta) => void;
  warn: (message: string, meta?: LogMeta) => void;
  error: (message: string, meta?: LogMeta, error?: unknown) => void;
  child: (suffix: string) => Logger;
}

export function createLogger(scope: string): Logger {
  function write(level: LogLevel, message: string, meta?: LogMeta, error?: unknown): void {
    const line = `${new Date().toISOString()} [${scope}] ${level.toUpperCase()}: ${message}${formatMeta(meta)}`;
    if (level === "error") {
      console.error(line, error ?? "");
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    if (level === "debug" && !shouldLogDebug()) return;
    console.log(line);
  }

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta, error) => write("error", message, meta, error),
    child: (suffix) => createLogger(`${scope}:${suffix}`),
  };
}

export class StageTimer {
  private readonly started_at = Date.now();
  private readonly stage_started_at = new Map<string, number>();

  start(stage: string): void {
    this.stage_started_at.set(stage, Date.now());
  }

  elapsedMs(stage?: string): number {
    const from = stage ? this.stage_started_at.get(stage) : undefined;
    return Date.now() - (from ?? this.started_at);
  }

  end(stage: string): { duration_ms: number; total_elapsed_ms: number } {
    const duration_ms = this.elapsedMs(stage);
    this.stage_started_at.delete(stage);
    return { duration_ms, total_elapsed_ms: this.elapsedMs() };
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 100) / 10;
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}m ${rem}s`;
}

export function estimateEtaMs(processed: number, total: number, elapsed_ms: number): number | null {
  if (processed <= 0 || total <= processed || elapsed_ms <= 0) return null;
  const rate = processed / elapsed_ms;
  return Math.round((total - processed) / rate);
}
