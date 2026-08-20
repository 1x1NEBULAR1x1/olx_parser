import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { triggerCatalogEnrichment } from "@/server/catalog/catalog-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const body = await request.json().catch(() => ({})) as {
    entry_ids?: number[];
    only_pending?: boolean;
  };

  const result = await triggerCatalogEnrichment({
    entry_ids: body.entry_ids,
    only_pending: body.only_pending ?? !body.entry_ids?.length,
    trigger: "manual",
  });

  if (!result.started) {
    return NextResponse.json({ error: result.message }, { status: 409 });
  }

  return NextResponse.json(result);
}
