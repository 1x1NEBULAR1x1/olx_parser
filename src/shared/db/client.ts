import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const global_for_prisma = globalThis as unknown as {
  prisma?: PrismaClient;
  sqlite_pragmas?: Promise<void>;
};

// Prisma v7 больше не читает datasource url из schema.prisma для клиента —
// требуется явный driver adapter.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

export const prisma = global_for_prisma.prisma ?? new PrismaClient({ adapter });

async function applySqlitePragmas(): Promise<void> {
  await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL");
  await prisma.$executeRawUnsafe("PRAGMA busy_timeout=8000");
  await prisma.$executeRawUnsafe("PRAGMA synchronous=NORMAL");
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys=ON");
}

export function ensureSqlitePragmas(): Promise<void> {
  if (!global_for_prisma.sqlite_pragmas) {
    global_for_prisma.sqlite_pragmas = applySqlitePragmas().catch((error) => {
      global_for_prisma.sqlite_pragmas = undefined;
      throw error;
    });
  }
  return global_for_prisma.sqlite_pragmas;
}

void ensureSqlitePragmas();

if (process.env.NODE_ENV !== "production") {
  global_for_prisma.prisma = prisma;
}
