import cron from "node-cron";
import { triggerScan } from "./scan-manager";

// Карта минут -> cron-выражение. Ограниченный набор вариантов (см. /settings
// UI) — произвольные минуты не поддерживаются осознанно, чтобы не давать
// пользователю настроить слишком агрессивный интервал и не спамить OLX
// (см. TODO.md про HTTP 403 при частых полных сканах).
const CRON_EXPRESSION_BY_MINUTES: Record<number, string> = {
  15: "*/15 * * * *",
  30: "*/30 * * * *",
  60: "0 * * * *",
  180: "0 */3 * * *",
  360: "0 */6 * * *",
};

let active_task: ReturnType<typeof cron.schedule> | null = null;

/**
 * Пересоздаёт cron-задачу авто-скана: останавливает предыдущую (если была) и
 * запускает новую по карте `CRON_EXPRESSION_BY_MINUTES`. `minutes = 0` (или
 * любое значение вне карты) — авто-скан выключен, только ручной
 * `POST /api/scan/start` и единичный автозапуск при старте сервера
 * (instrumentation.ts) остаются активны.
 *
 * Вызывать: 1) один раз при старте сервера (после первого triggerScan()) с
 * текущим значением из AppSettings, 2) из PATCH /api/settings при изменении
 * auto_scan_interval_minutes.
 */
export function rescheduleAutoScan(minutes: number): void {
  if (active_task) {
    active_task.stop();
    active_task = null;
  }

  const cron_expression = CRON_EXPRESSION_BY_MINUTES[minutes];
  if (!cron_expression) return;

  active_task = cron.schedule(cron_expression, () => {
    console.log(`[scan-scheduler] Авто-скан по таймеру (${minutes} мин)...`);
    void triggerScan();
  });
}

export function isAutoScanEnabled(): boolean {
  return active_task !== null;
}
