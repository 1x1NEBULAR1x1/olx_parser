-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "battery_health_threshold_percent" INTEGER NOT NULL DEFAULT 80,
    "exclude_junk_listings" BOOLEAN NOT NULL DEFAULT true,
    "junk_min_release_year" INTEGER NOT NULL DEFAULT 2017,
    "exclude_iphone" BOOLEAN NOT NULL DEFAULT false,
    "exclude_android" BOOLEAN NOT NULL DEFAULT false,
    "auto_scan_interval_minutes" INTEGER NOT NULL DEFAULT 0,
    "cache_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("auto_scan_interval_minutes", "battery_health_threshold_percent", "cache_ttl_hours", "exclude_junk_listings", "id", "junk_min_release_year", "updatedAt") SELECT "auto_scan_interval_minutes", "battery_health_threshold_percent", "cache_ttl_hours", "exclude_junk_listings", "id", "junk_min_release_year", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
