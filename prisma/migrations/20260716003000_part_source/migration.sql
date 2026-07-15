-- AlterTable
ALTER TABLE "Part" ADD COLUMN "is_estimate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Part" ADD COLUMN "source" TEXT;
