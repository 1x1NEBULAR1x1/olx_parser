export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reconcileStaleScanRuns, getAppSettings } = await import("@/server/repositories/devices-repository");
    const { triggerScan } = await import("@/server/scan/scan-manager");
    const { rescheduleAutoScan } = await import("@/server/scan/scan-scheduler");
    // Чистим "зависшие" ScanRun от предыдущего процесса до первого triggerScan(),
    // иначе isScanRunningInDb() навсегда решит, что скан ещё идёт.
    await reconcileStaleScanRuns();

    const skip_auto_scan = process.env.E2E_SKIP_AUTH === "true" || process.env.E2E_SKIP_SCAN === "true";
    if (!skip_auto_scan) {
      void triggerScan();
    }

    const settings = await getAppSettings();
    if (!skip_auto_scan) {
      rescheduleAutoScan(settings.auto_scan_interval_minutes);
    }
  }
}
