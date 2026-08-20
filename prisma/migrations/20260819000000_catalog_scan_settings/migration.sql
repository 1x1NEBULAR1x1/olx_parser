-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "catalog_auto_enrich_interval_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppSettings" ADD COLUMN "catalog_antibot_wait_seconds" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "AppSettings" ADD COLUMN "catalog_antibot_retries" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "AppSettings" ADD COLUMN "catalog_source_delay_ms" INTEGER NOT NULL DEFAULT 400;
