-- CreateTable
CREATE TABLE "CatalogJobState" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "progress_json" TEXT,
    "updatedAt" DATETIME NOT NULL
);
