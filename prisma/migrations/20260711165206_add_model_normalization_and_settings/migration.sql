-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "battery_health_threshold_percent" INTEGER NOT NULL DEFAULT 80,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "olx_url" TEXT NOT NULL,
    "price_buy" REAL,
    "price_currency" TEXT,
    "is_negotiable" BOOLEAN,
    "brand" TEXT NOT NULL,
    "model_query" TEXT NOT NULL,
    "model_key" TEXT NOT NULL DEFAULT '',
    "model_label" TEXT NOT NULL DEFAULT '',
    "photos" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "listing_created_at" DATETIME NOT NULL,
    "release_year" INTEGER,
    "has_box" BOOLEAN NOT NULL DEFAULT false,
    "battery_health_percent" INTEGER,
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
INSERT INTO "new_Device" ("allegro_search_url", "brand", "city", "createdAt", "damage_types", "id", "ifixit_device_name", "ifixit_url", "is_negotiable", "last_analyzed_at", "liquidity_label", "liquidity_score", "listing_created_at", "market_sell_price", "model_query", "olx_url", "parts_cost_estimate", "photos", "post_summary", "price_buy", "price_currency", "profit_estimate", "profitability_pct", "region", "repairability_scale", "repairability_score", "scan_id", "title", "updatedAt") SELECT "allegro_search_url", "brand", "city", "createdAt", "damage_types", "id", "ifixit_device_name", "ifixit_url", "is_negotiable", "last_analyzed_at", "liquidity_label", "liquidity_score", "listing_created_at", "market_sell_price", "model_query", "olx_url", "parts_cost_estimate", "photos", "post_summary", "price_buy", "price_currency", "profit_estimate", "profitability_pct", "region", "repairability_scale", "repairability_score", "scan_id", "title", "updatedAt" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE INDEX "Device_brand_idx" ON "Device"("brand");
CREATE INDEX "Device_profitability_pct_idx" ON "Device"("profitability_pct");
CREATE INDEX "Device_scan_id_idx" ON "Device"("scan_id");
CREATE INDEX "Device_model_key_idx" ON "Device"("model_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
