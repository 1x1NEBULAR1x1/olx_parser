import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { getCatalogEnrichmentStatus, waitForCatalogCursorChange } from "@/server/catalog/catalog-manager";
import { clampLongPollTimeout, LongPollAbortError } from "@/server/shared/long-poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const search = new URL(request.url).searchParams;
  const wait = search.get("wait") === "1";
  const cursor = search.get("cursor") ?? "";

  if (wait) {
    try {
      await waitForCatalogCursorChange(
        cursor,
        clampLongPollTimeout(Number(search.get("timeout") ?? "")),
        request.signal,
      );
    } catch (error) {
      if (error instanceof LongPollAbortError || request.signal.aborted) {
        return new NextResponse(null, { status: 499 });
      }
      throw error;
    }
  }

  const status = await getCatalogEnrichmentStatus();
  return NextResponse.json({
    ...status,
    timed_out: wait && Boolean(cursor) && status.cursor === cursor,
  });
}
