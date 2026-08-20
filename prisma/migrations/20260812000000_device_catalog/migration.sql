-- Каталог моделей устройств: кеш ремонтопригодности, рыночной цены, запчастей + ручные правки.
CREATE TABLE "DeviceCatalogEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "brand" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "model_label" TEXT NOT NULL DEFAULT '',
    "model_line" TEXT NOT NULL DEFAULT '',
    "model_line_label" TEXT NOT NULL DEFAULT '',
    "model_query" TEXT NOT NULL DEFAULT '',
    "release_year" INTEGER,
    "repairability_score" REAL,
    "repairability_scale" REAL,
    "ifixit_device_name" TEXT,
    "ifixit_url" TEXT,
    "market_sell_price" REAL,
    "market_sell_price_source" TEXT,
    "manual_repairability_score" REAL,
    "manual_repairability_scale" REAL,
    "manual_market_sell_price" REAL,
    "manual_repair_complexity_pct" REAL,
    "lock_repairability" BOOLEAN NOT NULL DEFAULT false,
    "lock_market_price" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "enrichment_status" TEXT NOT NULL DEFAULT 'pending',
    "last_enriched_at" DATETIME,
    "last_enrichment_error" TEXT,
    "listings_seen_count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "DeviceCatalogEntry_brand_model_key_key" ON "DeviceCatalogEntry"("brand", "model_key");
CREATE INDEX "DeviceCatalogEntry_enrichment_status_idx" ON "DeviceCatalogEntry"("enrichment_status");
CREATE INDEX "DeviceCatalogEntry_brand_idx" ON "DeviceCatalogEntry"("brand");

CREATE TABLE "CatalogEnrichmentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME,
    "total_models" INTEGER NOT NULL DEFAULT 0,
    "processed_models" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX "CatalogEnrichmentRun_status_idx" ON "CatalogEnrichmentRun"("status");
CREATE INDEX "CatalogEnrichmentRun_started_at_idx" ON "CatalogEnrichmentRun"("started_at");
