export type JobName = "kimovil_prefetch" | "allegro_prefetch" | "median_cache" | "olx_market_prefetch" | "l2_cache";

export interface QueueJob<TPayload = Record<string, unknown>> {
  id: string;
  name: JobName;
  payload: TPayload;
}

export type JobHandler<TPayload = Record<string, unknown>> = (payload: TPayload) => Promise<void>;

export interface JobQueueStats {
  queued: number;
  running: boolean;
  completed: number;
  failed: number;
}

interface PendingJob {
  job: QueueJob;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export function createJobQueue(
  handlers: Partial<Record<JobName, JobHandler>>,
): {
  enqueue: <TPayload>(name: JobName, payload: TPayload) => Promise<void>;
  size: () => number;
  isRunning: () => boolean;
  stats: () => JobQueueStats;
  waitUntilIdle: () => Promise<void>;
} {
  const pending: PendingJob[] = [];
  let running = false;
  let completed = 0;
  let failed = 0;
  let next_id = 1;
  let idle_waiters: Array<() => void> = [];

  function notifyIdle(): void {
    if (running || pending.length > 0) return;
    const waiters = idle_waiters;
    idle_waiters = [];
    for (const waiter of waiters) waiter();
  }

  async function pump(): Promise<void> {
    if (running) return;
    running = true;

    try {
      while (pending.length > 0) {
        const current = pending.shift();
        if (!current) break;
        const handler = handlers[current.job.name];
        try {
          if (!handler) {
            throw new Error(`No handler for job ${current.job.name}`);
          }
          await handler(current.job.payload);
          completed += 1;
          current.resolve();
        } catch (error) {
          failed += 1;
          current.reject(error);
        }
      }
    } finally {
      running = false;
      if (pending.length > 0) {
        void pump();
      } else {
        notifyIdle();
      }
    }
  }

  return {
    enqueue<TPayload>(name: JobName, payload: TPayload): Promise<void> {
      const job: QueueJob = {
        id: `job_${next_id}`,
        name,
        payload: payload as Record<string, unknown>,
      };
      next_id += 1;

      const promise = new Promise<void>((resolve, reject) => {
        pending.push({ job, resolve, reject });
      });
      void pump();
      return promise;
    },
    size: () => pending.length + (running ? 1 : 0),
    isRunning: () => running,
    stats: () => ({
      queued: pending.length,
      running,
      completed,
      failed,
    }),
    waitUntilIdle: () => {
      if (!running && pending.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idle_waiters.push(resolve);
      });
    },
  };
}
