-- Per-user notification settings, notifications and dedup.
-- Старые глобальные таблицы очищаются: синглтон NotificationSettings и
-- анонимные Notification/NotifiedListing не переносятся (снимки без user_id).

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "NotificationSettings";
DROP TABLE IF EXISTS "Notification";
DROP TABLE IF EXISTS "NotifiedListing";

CREATE TABLE "UserNotificationSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "brands" TEXT NOT NULL DEFAULT '[]',
    "model_keys" TEXT NOT NULL DEFAULT '[]',
    "min_profitability_pct" REAL,
    "max_profitability_pct" REAL,
    "min_price" REAL,
    "max_price" REAL,
    "regions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserNotificationSettings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserNotificationSettings_user_id_key" ON "UserNotificationSettings"("user_id");

CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
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
    "source" TEXT NOT NULL DEFAULT 'scan',
    "telegram_status" TEXT NOT NULL DEFAULT 'skipped',
    "telegram_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Notification_user_id_is_read_idx" ON "Notification"("user_id", "is_read");
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");
CREATE INDEX "Notification_source_idx" ON "Notification"("source");

CREATE TABLE "NotifiedListing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "olx_listing_id" INTEGER NOT NULL,
    "notified_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotifiedListing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NotifiedListing_user_id_olx_listing_id_key" ON "NotifiedListing"("user_id", "olx_listing_id");
CREATE INDEX "NotifiedListing_user_id_idx" ON "NotifiedListing"("user_id");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
