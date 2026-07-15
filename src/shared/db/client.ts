import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const global_for_prisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma v7 больше не читает datasource url из schema.prisma для клиента —
// требуется явный driver adapter.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

export const prisma = global_for_prisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  global_for_prisma.prisma = prisma;
}
