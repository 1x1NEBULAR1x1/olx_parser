import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { loadDevicesFeed } from "@/server/domain/feed-loader";
import { jsonError } from "@/server/shared/api-response";
import { parseDeviceFeedPageQuery } from "@/shared/lib/device-feed-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;

function parseBooleanFlag(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function GET(request: NextRequest) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const { searchParams } = request.nextUrl;
  const feed_query = parseDeviceFeedPageQuery(searchParams, { offset: 0, limit: DEFAULT_LIMIT });
  const favorites_only = parseBooleanFlag(searchParams.get("favorites_only"));
  const include_hidden = parseBooleanFlag(searchParams.get("include_hidden"));

  try {
    const response = await loadDevicesFeed(auth_result.user.id, feed_query, {
      favorites_only,
      include_hidden,
    });
    return NextResponse.json(response);
  } catch {
    return jsonError(
      "Не удалось загрузить ленту. Сервер занят или база временно недоступна.",
      503,
      "feed_unavailable",
    );
  }
}
