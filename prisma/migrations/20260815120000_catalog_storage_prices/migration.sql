-- Per-storage manual market prices for catalog models (JSON map GB -> PLN).

ALTER TABLE "DeviceCatalogEntry" ADD COLUMN "manual_storage_prices" TEXT;
