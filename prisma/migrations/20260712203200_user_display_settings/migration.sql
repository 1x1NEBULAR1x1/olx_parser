-- CreateTable
CREATE TABLE "UserDisplaySettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "exclude_junk_listings" BOOLEAN NOT NULL DEFAULT true,
    "junk_min_release_year" INTEGER NOT NULL DEFAULT 2017,
    "exclude_iphone" BOOLEAN NOT NULL DEFAULT false,
    "exclude_android" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserDisplaySettings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Перенос глобальных настроек отображения в персональные записи для каждого пользователя.
INSERT INTO "UserDisplaySettings" (
    "user_id",
    "exclude_junk_listings",
    "junk_min_release_year",
    "exclude_iphone",
    "exclude_android",
    "updatedAt"
)
SELECT
    "User"."id",
    COALESCE("AppSettings"."exclude_junk_listings", true),
    COALESCE("AppSettings"."junk_min_release_year", 2017),
    COALESCE("AppSettings"."exclude_iphone", false),
    COALESCE("AppSettings"."exclude_android", false),
    CURRENT_TIMESTAMP
FROM "User"
CROSS JOIN "AppSettings"
WHERE "AppSettings"."id" = 1;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "battery_health_threshold_percent" INTEGER NOT NULL DEFAULT 80,
    "auto_scan_interval_minutes" INTEGER NOT NULL DEFAULT 0,
    "cache_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("auto_scan_interval_minutes", "battery_health_threshold_percent", "cache_ttl_hours", "id", "updatedAt") SELECT "auto_scan_interval_minutes", "battery_health_threshold_percent", "cache_ttl_hours", "id", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "UserDisplaySettings_user_id_key" ON "UserDisplaySettings"("user_id");
