-- Логистика PL, подписки, ручной режим Allegro для запчастей.
ALTER TABLE "AppSettings" ADD COLUMN "shipping_parts_pln" REAL NOT NULL DEFAULT 14;
ALTER TABLE "AppSettings" ADD COLUMN "shipping_to_repair_pln" REAL NOT NULL DEFAULT 18;
ALTER TABLE "AppSettings" ADD COLUMN "shipping_to_customer_pln" REAL NOT NULL DEFAULT 14;
ALTER TABLE "AppSettings" ADD COLUMN "repair_labor_base_pln" REAL NOT NULL DEFAULT 80;
ALTER TABLE "AppSettings" ADD COLUMN "subscription_basic_pln" REAL NOT NULL DEFAULT 0;
ALTER TABLE "AppSettings" ADD COLUMN "subscription_pro_pln" REAL NOT NULL DEFAULT 49;
ALTER TABLE "AppSettings" ADD COLUMN "allegro_parts_auto_enabled" BOOLEAN NOT NULL DEFAULT false;
