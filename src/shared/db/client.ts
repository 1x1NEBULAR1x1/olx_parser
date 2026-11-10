import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const global_for_prisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Prisma v7 больше не читает datasource url из schema.prisma для клиента —
// требуется явный driver adapter.
function resolveDatabaseUrl(): string {
  const database_url = process.env.DATABASE_URL;
  if (database_url) return database_url;
  // Vitest импортирует репозитории с top-level prisma; реальные запросы к БД в unit-тестах не идут.
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    return "postgresql://postgres:postgres@127.0.0.1:5432/olx_parser?schema=public";
  }
  throw new Error("DATABASE_URL is not set (ожидается postgresql://...)");
}

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });

export const prisma = global_for_prisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  global_for_prisma.prisma = prisma;
}
