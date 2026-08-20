import cron from "node-cron";
import { triggerCatalogEnrichment } from "@/server/catalog/catalog-manager";

const CRON_EXPRESSION_BY_MINUTES: Record<number, string> = {
  60: "0 * * * *",
  180: "0 */3 * * *",
  360: "0 */6 * * *",
  720: "0 */12 * * *",
  1440: "0 4 * * *",
};

let active_task: ReturnType<typeof cron.schedule> | null = null;

export function rescheduleCatalogAutoEnrich(minutes: number): void {
  if (active_task) {
    active_task.stop();
    active_task = null;
  }

  const cron_expression = CRON_EXPRESSION_BY_MINUTES[minutes];
  if (!cron_expression) return;

  active_task = cron.schedule(cron_expression, () => {
    console.log(`[catalog-scheduler] Авто-заполнение каталога (${minutes} мин)...`);
    void triggerCatalogEnrichment({
      only_pending: true,
      trigger: "auto",
    });
  });
}

export function isCatalogAutoEnrichEnabled(): boolean {
  return active_task !== null;
}
