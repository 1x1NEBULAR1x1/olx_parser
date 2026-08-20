import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { listCatalogEntries, listCatalogEntryIdsForFilters } from "@/server/repositories/catalog-repository";
import { jsonError } from "@/server/shared/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const { searchParams } = new URL(request.url);
  const offset = Number(searchParams.get("offset") ?? "0");
  const limit = Number(searchParams.get("limit") ?? "50");
  const brand = searchParams.get("brand") ?? undefined;
  const model_line = searchParams.get("model_line") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const ids_only = searchParams.get("ids_only") === "1";

  try {
    if (ids_only) {
      const entry_ids = await listCatalogEntryIdsForFilters({ brand, model_line, status, search });
      return NextResponse.json({ entry_ids, total_count: entry_ids.length });
    }
    const result = await listCatalogEntries({ offset, limit, brand, model_line, status, search });
    return NextResponse.json(result);
  } catch {
    return jsonError("Не удалось загрузить каталог устройств.", 503, "catalog_unavailable");
  }
}
