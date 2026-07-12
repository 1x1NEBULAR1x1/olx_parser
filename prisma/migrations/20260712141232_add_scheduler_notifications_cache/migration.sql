-- CreateTable
CREATE TABLE "ModelCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "brand" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "repairability_score" REAL,
    "repairability_scale" REAL,
    "ifixit_device_name" TEXT,
    "ifixit_url" TEXT,
    "avg_market_price" REAL,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PartsCostCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "brand" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "damage_signature" TEXT NOT NULL DEFAULT '',
    "parts_cost_estimate" REAL,
    "allegro_search_url" TEXT,
    "parts_json" TEXT,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "brands" TEXT NOT NULL DEFAULT '[]',
    "model_keys" TEXT NOT NULL DEFAULT '[]',
    "min_profitability_pct" REAL,
    "max_profitability_pct" REAL,
    "min_price" REAL,
    "max_price" REAL,
    "regions" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "olx_listing_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "olx_url" TEXT NOT NULL,
    "price_buy" REAL,
    "profitability_pct" REAL,
    "market_sell_price" REAL,
    "city" TEXT,
    "region" TEXT,
    "photo_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NotifiedListing" (
    "olx_listing_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "notified_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "battery_health_threshold_percent" INTEGER NOT NULL DEFAULT 80,
    "exclude_junk_listings" BOOLEAN NOT NULL DEFAULT true,
    "junk_min_release_year" INTEGER NOT NULL DEFAULT 2017,
    "auto_scan_interval_minutes" INTEGER NOT NULL DEFAULT 0,
    "cache_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("battery_health_threshold_percent", "exclude_junk_listings", "id", "junk_min_release_year", "updatedAt") SELECT "battery_health_threshold_percent", "exclude_junk_listings", "id", "junk_min_release_year", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ModelCache_expires_at_idx" ON "ModelCache"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ModelCache_brand_model_key_key" ON "ModelCache"("brand", "model_key");

-- CreateIndex
CREATE INDEX "PartsCostCache_expires_at_idx" ON "PartsCostCache"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "PartsCostCache_brand_model_key_damage_signature_key" ON "PartsCostCache"("brand", "model_key", "damage_signature");

-- CreateIndex
CREATE INDEX "Notification_is_read_idx" ON "Notification"("is_read");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");
