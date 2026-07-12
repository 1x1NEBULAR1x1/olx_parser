-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "battery_health_threshold_percent" INTEGER NOT NULL DEFAULT 80,
    "exclude_junk_listings" BOOLEAN NOT NULL DEFAULT true,
    "junk_min_release_year" INTEGER NOT NULL DEFAULT 2017,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("battery_health_threshold_percent", "id", "updatedAt") SELECT "battery_health_threshold_percent", "id", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
