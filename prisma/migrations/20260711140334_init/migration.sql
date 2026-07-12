-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME,
    "devices_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT
);

-- CreateTable
CREATE TABLE "Device" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "olx_url" TEXT NOT NULL,
    "price_buy" REAL,
    "price_currency" TEXT,
    "is_negotiable" BOOLEAN,
    "brand" TEXT NOT NULL,
    "model_query" TEXT NOT NULL,
    "photos" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "listing_created_at" DATETIME NOT NULL,
    "damage_types" TEXT NOT NULL,
    "post_summary" TEXT NOT NULL,
    "repairability_score" REAL,
    "repairability_scale" REAL,
    "ifixit_device_name" TEXT,
    "ifixit_url" TEXT,
    "allegro_search_url" TEXT,
    "parts_cost_estimate" REAL,
    "market_sell_price" REAL,
    "profit_estimate" REAL,
    "profitability_pct" REAL,
    "liquidity_score" REAL,
    "liquidity_label" TEXT,
    "last_analyzed_at" DATETIME NOT NULL,
    "scan_id" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "ScanRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Part" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "price" REAL,
    "currency" TEXT,
    "url" TEXT NOT NULL,
    "image" TEXT,
    "damage_type" TEXT,
    "device_id" INTEGER NOT NULL,
    CONSTRAINT "Part_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScanRun_status_idx" ON "ScanRun"("status");

-- CreateIndex
CREATE INDEX "ScanRun_started_at_idx" ON "ScanRun"("started_at");

-- CreateIndex
CREATE INDEX "Device_brand_idx" ON "Device"("brand");

-- CreateIndex
CREATE INDEX "Device_profitability_pct_idx" ON "Device"("profitability_pct");

-- CreateIndex
CREATE INDEX "Device_scan_id_idx" ON "Device"("scan_id");

-- CreateIndex
CREATE INDEX "Part_device_id_idx" ON "Part"("device_id");
