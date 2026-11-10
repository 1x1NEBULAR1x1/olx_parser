-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "devices_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "stage" TEXT,
    "total_listings" INTEGER,
    "processed_listings" INTEGER NOT NULL DEFAULT 0,
    "issues_count" INTEGER NOT NULL DEFAULT 0,
    "warnings_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanIssue" (
    "id" SERIAL NOT NULL,
    "scan_id" TEXT NOT NULL,
    "listing_id" INTEGER,
    "olx_url" TEXT,
    "title" TEXT,
    "severity" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "olx_url" TEXT NOT NULL,
    "price_buy" DOUBLE PRECISION,
    "price_currency" TEXT,
    "is_negotiable" BOOLEAN,
    "brand" TEXT NOT NULL,
    "model_query" TEXT NOT NULL,
    "model_key" TEXT NOT NULL DEFAULT '',
    "model_label" TEXT NOT NULL DEFAULT '',
    "model_line" TEXT NOT NULL DEFAULT '',
    "model_line_label" TEXT NOT NULL DEFAULT '',
    "photos" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "listing_created_at" TIMESTAMP(3) NOT NULL,
    "release_year" INTEGER,
    "has_box" BOOLEAN NOT NULL DEFAULT false,
    "battery_health_percent" INTEGER,
    "storage_gb" INTEGER,
    "seller_name" TEXT,
    "seller_ads_count" INTEGER,
    "seller_member_since" TEXT,
    "damage_types" TEXT NOT NULL,
    "post_summary" TEXT NOT NULL,
    "repairability_score" DOUBLE PRECISION,
    "repairability_scale" DOUBLE PRECISION,
    "ifixit_device_name" TEXT,
    "ifixit_url" TEXT,
    "allegro_search_url" TEXT,
    "parts_cost_estimate" DOUBLE PRECISION,
    "market_sell_price" DOUBLE PRECISION,
    "market_sell_price_source" TEXT,
    "profit_estimate" DOUBLE PRECISION,
    "profitability_pct" DOUBLE PRECISION,
    "confidence_score" INTEGER,
    "confidence_label" TEXT,
    "risk_adjusted_profit" DOUBLE PRECISION,
    "risk_adjusted_profitability_pct" DOUBLE PRECISION,
    "parts_real_count" INTEGER NOT NULL DEFAULT 0,
    "parts_estimate_count" INTEGER NOT NULL DEFAULT 0,
    "liquidity_score" DOUBLE PRECISION,
    "liquidity_label" TEXT,
    "last_analyzed_at" TIMESTAMP(3) NOT NULL,
    "scan_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "battery_health_threshold_percent" INTEGER NOT NULL DEFAULT 80,
    "auto_scan_interval_minutes" INTEGER NOT NULL DEFAULT 0,
    "cache_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "shipping_parts_pln" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "shipping_to_repair_pln" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "shipping_to_customer_pln" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "repair_labor_base_pln" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "subscription_basic_pln" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subscription_pro_pln" DOUBLE PRECISION NOT NULL DEFAULT 49,
    "allegro_parts_auto_enabled" BOOLEAN NOT NULL DEFAULT false,
    "catalog_auto_enrich_interval_minutes" INTEGER NOT NULL DEFAULT 0,
    "catalog_antibot_wait_seconds" INTEGER NOT NULL DEFAULT 45,
    "catalog_antibot_retries" INTEGER NOT NULL DEFAULT 2,
    "catalog_source_delay_ms" INTEGER NOT NULL DEFAULT 400,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "currency" TEXT,
    "url" TEXT NOT NULL,
    "image" TEXT,
    "damage_type" TEXT,
    "is_estimate" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "device_id" INTEGER NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelCache" (
    "id" SERIAL NOT NULL,
    "brand" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "repairability_score" DOUBLE PRECISION,
    "repairability_scale" DOUBLE PRECISION,
    "ifixit_device_name" TEXT,
    "ifixit_url" TEXT,
    "avg_market_price" DOUBLE PRECISION,
    "kimovil_geek_score" DOUBLE PRECISION,
    "kimovil_user_score" DOUBLE PRECISION,
    "kimovil_combined_score" DOUBLE PRECISION,
    "kimovil_matched_name" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCatalogEntry" (
    "id" SERIAL NOT NULL,
    "brand" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "model_label" TEXT NOT NULL DEFAULT '',
    "model_line" TEXT NOT NULL DEFAULT '',
    "model_line_label" TEXT NOT NULL DEFAULT '',
    "model_query" TEXT NOT NULL DEFAULT '',
    "release_year" INTEGER,
    "repairability_score" DOUBLE PRECISION,
    "repairability_scale" DOUBLE PRECISION,
    "ifixit_device_name" TEXT,
    "ifixit_url" TEXT,
    "market_sell_price" DOUBLE PRECISION,
    "market_sell_price_source" TEXT,
    "manual_repairability_score" DOUBLE PRECISION,
    "manual_repairability_scale" DOUBLE PRECISION,
    "manual_market_sell_price" DOUBLE PRECISION,
    "manual_storage_prices" TEXT,
    "manual_repair_complexity_pct" DOUBLE PRECISION,
    "lock_repairability" BOOLEAN NOT NULL DEFAULT false,
    "lock_market_price" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "enrichment_status" TEXT NOT NULL DEFAULT 'pending',
    "last_enriched_at" TIMESTAMP(3),
    "last_enrichment_error" TEXT,
    "listings_seen_count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogEnrichmentRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "total_models" INTEGER NOT NULL DEFAULT 0,
    "processed_models" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "CatalogEnrichmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogJobState" (
    "id" INTEGER NOT NULL,
    "progress_json" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogJobState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistorySnapshot" (
    "id" SERIAL NOT NULL,
    "scan_id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "storage_gb" INTEGER,
    "median_working_price" DOUBLE PRECISION NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanCoordinator" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "is_scan_active" BOOLEAN NOT NULL DEFAULT false,
    "active_scan_id" TEXT,
    "locked_until" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanCoordinator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsCostCache" (
    "id" SERIAL NOT NULL,
    "brand" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "damage_signature" TEXT NOT NULL DEFAULT '',
    "parts_cost_estimate" DOUBLE PRECISION,
    "allegro_search_url" TEXT,
    "parts_json" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartsCostCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationSettings" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "brands" TEXT NOT NULL DEFAULT '[]',
    "model_keys" TEXT NOT NULL DEFAULT '[]',
    "min_profitability_pct" DOUBLE PRECISION,
    "max_profitability_pct" DOUBLE PRECISION,
    "min_price" DOUBLE PRECISION,
    "max_price" DOUBLE PRECISION,
    "regions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "olx_listing_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "olx_url" TEXT NOT NULL,
    "price_buy" DOUBLE PRECISION,
    "profitability_pct" DOUBLE PRECISION,
    "market_sell_price" DOUBLE PRECISION,
    "city" TEXT,
    "region" TEXT,
    "photo_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'scan',
    "telegram_status" TEXT NOT NULL DEFAULT 'skipped',
    "telegram_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotifiedListing" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "olx_listing_id" INTEGER NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotifiedListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDisplaySettings" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "exclude_junk_listings" BOOLEAN NOT NULL DEFAULT true,
    "junk_min_release_year" INTEGER NOT NULL DEFAULT 2017,
    "exclude_iphone" BOOLEAN NOT NULL DEFAULT false,
    "exclude_android" BOOLEAN NOT NULL DEFAULT false,
    "battery_health_threshold_percent" INTEGER NOT NULL DEFAULT 80,
    "exclude_unprofitable" BOOLEAN NOT NULL DEFAULT false,
    "min_profit_pln" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min_profit_pct_of_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDisplaySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "FavoriteDevice" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenDevice" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanRun_status_idx" ON "ScanRun"("status");

-- CreateIndex
CREATE INDEX "ScanRun_started_at_idx" ON "ScanRun"("started_at");

-- CreateIndex
CREATE INDEX "ScanIssue_scan_id_idx" ON "ScanIssue"("scan_id");

-- CreateIndex
CREATE INDEX "ScanIssue_severity_idx" ON "ScanIssue"("severity");

-- CreateIndex
CREATE INDEX "ScanIssue_created_at_idx" ON "ScanIssue"("created_at");

-- CreateIndex
CREATE INDEX "Device_brand_idx" ON "Device"("brand");

-- CreateIndex
CREATE INDEX "Device_profitability_pct_idx" ON "Device"("profitability_pct");

-- CreateIndex
CREATE INDEX "Device_scan_id_idx" ON "Device"("scan_id");

-- CreateIndex
CREATE INDEX "Device_model_key_idx" ON "Device"("model_key");

-- CreateIndex
CREATE INDEX "Device_model_line_idx" ON "Device"("model_line");

-- CreateIndex
CREATE INDEX "Part_device_id_idx" ON "Part"("device_id");

-- CreateIndex
CREATE INDEX "ModelCache_expires_at_idx" ON "ModelCache"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ModelCache_brand_model_key_key" ON "ModelCache"("brand", "model_key");

-- CreateIndex
CREATE INDEX "DeviceCatalogEntry_enrichment_status_idx" ON "DeviceCatalogEntry"("enrichment_status");

-- CreateIndex
CREATE INDEX "DeviceCatalogEntry_brand_idx" ON "DeviceCatalogEntry"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCatalogEntry_brand_model_key_key" ON "DeviceCatalogEntry"("brand", "model_key");

-- CreateIndex
CREATE INDEX "CatalogEnrichmentRun_status_idx" ON "CatalogEnrichmentRun"("status");

-- CreateIndex
CREATE INDEX "CatalogEnrichmentRun_started_at_idx" ON "CatalogEnrichmentRun"("started_at");

-- CreateIndex
CREATE INDEX "PriceHistorySnapshot_brand_model_key_idx" ON "PriceHistorySnapshot"("brand", "model_key");

-- CreateIndex
CREATE INDEX "PriceHistorySnapshot_scan_id_idx" ON "PriceHistorySnapshot"("scan_id");

-- CreateIndex
CREATE INDEX "PriceHistorySnapshot_recorded_at_idx" ON "PriceHistorySnapshot"("recorded_at");

-- CreateIndex
CREATE INDEX "PartsCostCache_expires_at_idx" ON "PartsCostCache"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "PartsCostCache_brand_model_key_damage_signature_key" ON "PartsCostCache"("brand", "model_key", "damage_signature");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationSettings_user_id_key" ON "UserNotificationSettings"("user_id");

-- CreateIndex
CREATE INDEX "Notification_user_id_is_read_idx" ON "Notification"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");

-- CreateIndex
CREATE INDEX "Notification_source_idx" ON "Notification"("source");

-- CreateIndex
CREATE INDEX "NotifiedListing_user_id_idx" ON "NotifiedListing"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "NotifiedListing_user_id_olx_listing_id_key" ON "NotifiedListing"("user_id", "olx_listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_is_approved_idx" ON "User"("is_approved");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_user_id_idx" ON "PushSubscription"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserDisplaySettings_user_id_key" ON "UserDisplaySettings"("user_id");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "FavoriteDevice_user_id_idx" ON "FavoriteDevice"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteDevice_user_id_device_id_key" ON "FavoriteDevice"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "HiddenDevice_user_id_idx" ON "HiddenDevice"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenDevice_user_id_device_id_key" ON "HiddenDevice"("user_id", "device_id");

-- AddForeignKey
ALTER TABLE "ScanIssue" ADD CONSTRAINT "ScanIssue_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "ScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "ScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationSettings" ADD CONSTRAINT "UserNotificationSettings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotifiedListing" ADD CONSTRAINT "NotifiedListing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDisplaySettings" ADD CONSTRAINT "UserDisplaySettings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteDevice" ADD CONSTRAINT "FavoriteDevice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenDevice" ADD CONSTRAINT "HiddenDevice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
