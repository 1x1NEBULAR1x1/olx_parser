import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { getScanStatus, waitForScanCursorChange } from "@/server/scan/scan-manager";
import { clampLongPollTimeout, LongPollAbortError } from "@/server/shared/long-poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const search = new URL(request.url).searchParams;
  const light = search.get("light") === "1";
  const wait = search.get("wait") === "1";
  const cursor = search.get("cursor") ?? "";

  if (wait) {
    try {
      await waitForScanCursorChange(
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

  const status = await getScanStatus({ light: wait ? true : light });
  return NextResponse.json({
    ...status,
    timed_out: wait && Boolean(cursor) && status.cursor === cursor,
  });
}
