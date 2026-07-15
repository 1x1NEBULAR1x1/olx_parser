/**
 * Чанковая выгрузка цен parts-store.pl для всех моделей в БД.
 *
 * Запуск:
 *   npm run prefetch:parts-store
 *   npm run prefetch:parts-store -- --export=data/parts-store-export.json
 */
import "dotenv/config";
import path from "node:path";
import { prefetchPartsStoreCatalog } from "../src/server/fetchers/parts-store-prefetch";

function parseExportPath(): string | null {
  const arg = process.argv.find((item) => item.startsWith("--export="));
  if (!arg) {
    return path.join(process.cwd(), "data", "parts-store-export.json");
  }
  const value = arg.slice("--export=".length).trim();
  return value.length > 0 ? value : null;
}

async function main() {
  const export_path = parseExportPath();
  const { stats } = await prefetchPartsStoreCatalog({
    export_path: export_path ?? undefined,
  });

  console.log("Parts-store prefetch done:");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
