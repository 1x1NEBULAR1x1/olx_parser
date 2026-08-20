import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { fetchPartsForCatalogEntry } from "@/server/catalog/manual-parts-fetch";
import { getAppSettings } from "@/server/repositories/devices-repository";
import type { ManualPartsFetchRequest, ManualPartsSource } from "@/shared/types/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_SOURCES: ManualPartsSource[] = ["allegro", "olx", "parts_store", "ceneo", "shop", "all"];

export async function POST(request: Request, context: RouteContext) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const { id } = await context.params;
  const entry_id = Number(id);
  if (!Number.isFinite(entry_id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as ManualPartsFetchRequest;
  if (body.sources?.some((source) => !VALID_SOURCES.includes(source))) {
    return NextResponse.json({ error: "Invalid sources" }, { status: 400 });
  }

  const settings = await getAppSettings();
  const result = await fetchPartsForCatalogEntry(entry_id, settings.cache_ttl_hours, {
    sources: body.sources,
    use_default_damage_sets: body.use_default_damage_sets,
    damage_types_sets: body.damage_types_sets,
  });

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
