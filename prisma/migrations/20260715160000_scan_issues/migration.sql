-- AlterTable
ALTER TABLE "ScanRun" ADD COLUMN "issues_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScanRun" ADD COLUMN "warnings_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ScanIssue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scan_id" TEXT NOT NULL,
    "listing_id" INTEGER,
    "olx_url" TEXT,
    "title" TEXT,
    "severity" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanIssue_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "ScanRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScanIssue_scan_id_idx" ON "ScanIssue"("scan_id");
CREATE INDEX "ScanIssue_severity_idx" ON "ScanIssue"("severity");
CREATE INDEX "ScanIssue_created_at_idx" ON "ScanIssue"("created_at");
