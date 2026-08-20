import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { getCatalogDeviceDetail, patchCatalogEntry } from "@/server/repositories/catalog-repository";
import type { DeviceCatalogPatch } from "@/shared/types/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const detail = await getCatalogDeviceDetail(Number(id), {
    brand: searchParams.get("brand") ?? undefined,
    model_line: searchParams.get("model_line") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const { id } = await context.params;
  const body = await request.json() as DeviceCatalogPatch;
  const updated = await patchCatalogEntry(Number(id), body);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: updated });
}
