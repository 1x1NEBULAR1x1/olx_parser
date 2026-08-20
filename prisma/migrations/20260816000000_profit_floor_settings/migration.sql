-- AlterTable
ALTER TABLE "UserDisplaySettings" ADD COLUMN "exclude_unprofitable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserDisplaySettings" ADD COLUMN "min_profit_pln" REAL NOT NULL DEFAULT 0;
ALTER TABLE "UserDisplaySettings" ADD COLUMN "min_profit_pct_of_price" REAL NOT NULL DEFAULT 0;
