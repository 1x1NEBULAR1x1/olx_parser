-- Волна 1: confidence, risk-adjusted ROI, история цен, Kimovil cache, scan lock.

ALTER TABLE "Device" ADD COLUMN "confidence_score" INTEGER;
ALTER TABLE "Device" ADD COLUMN "confidence_label" TEXT;
ALTER TABLE "Device" ADD COLUMN "risk_adjusted_profit" REAL;
ALTER TABLE "Device" ADD COLUMN "risk_adjusted_profitability_pct" REAL;
ALTER TABLE "Device" ADD COLUMN "parts_real_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Device" ADD COLUMN "parts_estimate_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Device_risk_adjusted_profitability_pct_idx" ON "Device"("risk_adjusted_profitability_pct");

ALTER TABLE "ModelCache" ADD COLUMN "kimovil_geek_score" REAL;
ALTER TABLE "ModelCache" ADD COLUMN "kimovil_user_score" REAL;
ALTER TABLE "ModelCache" ADD COLUMN "kimovil_combined_score" REAL;
ALTER TABLE "ModelCache" ADD COLUMN "kimovil_matched_name" TEXT;

CREATE TABLE "PriceHistorySnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scan_id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "storage_gb" INTEGER,
    "median_working_price" REAL NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PriceHistorySnapshot_brand_model_key_idx" ON "PriceHistorySnapshot"("brand", "model_key");
CREATE INDEX "PriceHistorySnapshot_scan_id_idx" ON "PriceHistorySnapshot"("scan_id");
CREATE INDEX "PriceHistorySnapshot_recorded_at_idx" ON "PriceHistorySnapshot"("recorded_at");

CREATE TABLE "ScanCoordinator" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "is_scan_active" BOOLEAN NOT NULL DEFAULT false,
    "active_scan_id" TEXT,
    "locked_until" DATETIME,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
