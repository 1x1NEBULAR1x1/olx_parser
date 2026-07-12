export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reconcileStaleScanRuns, getAppSettings } = await import("@/server/devices-repository");
    const { triggerScan } = await import("@/server/scan-manager");
    const { rescheduleAutoScan } = await import("@/server/scan-scheduler");
    // Чистим "зависшие" ScanRun от предыдущего процесса до первого triggerScan(),
    // иначе isScanRunningInDb() навсегда решит, что скан ещё идёт.
    await reconcileStaleScanRuns();
    void triggerScan();

    const settings = await getAppSettings();
    rescheduleAutoScan(settings.auto_scan_interval_minutes);
  }
}
