import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import {
  getAdminNotificationsPage,
  type NotificationSource,
} from "@/server/repositories/user-notifications-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const user_id = url.searchParams.get("user_id") ?? undefined;
  const source_raw = url.searchParams.get("source");
  const source =
    source_raw === "scan" || source_raw === "test" || source_raw === "scan_health"
      ? (source_raw as NotificationSource)
      : undefined;

  const page = await getAdminNotificationsPage({
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    user_id,
    source,
  });

  return NextResponse.json(page);
}
