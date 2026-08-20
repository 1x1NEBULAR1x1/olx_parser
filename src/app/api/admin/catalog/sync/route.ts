import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { syncCatalogFromLatestDevices } from "@/server/repositories/catalog-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const synced = await syncCatalogFromLatestDevices();
  return NextResponse.json({ synced, message: `Синхронизировано моделей: ${synced}` });
}
