-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME,
    "devices_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "stage" TEXT,
    "total_listings" INTEGER,
    "processed_listings" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_ScanRun" ("devices_count", "error_message", "finished_at", "id", "started_at", "status") SELECT "devices_count", "error_message", "finished_at", "id", "started_at", "status" FROM "ScanRun";
DROP TABLE "ScanRun";
ALTER TABLE "new_ScanRun" RENAME TO "ScanRun";
CREATE INDEX "ScanRun_status_idx" ON "ScanRun"("status");
CREATE INDEX "ScanRun_started_at_idx" ON "ScanRun"("started_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
