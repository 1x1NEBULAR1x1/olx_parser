-- Prisma мапит ScanCoordinator.updatedAt на колонку "updatedAt".
-- Миграция волны 1 создала "updated_at" — переименовываем.
ALTER TABLE "ScanCoordinator" RENAME COLUMN "updated_at" TO "updatedAt";
