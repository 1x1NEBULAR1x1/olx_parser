import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import {
  getNotificationsLiveSnapshot,
  getUnreadNotificationsCount,
} from "@/server/repositories/user-notifications-repository";
import { subscribeNotificationUpdate } from "@/server/shared/live-hub";
import { clampLongPollTimeout, LongPollAbortError, waitUntil } from "@/server/shared/long-poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const user_id = auth_result.user.id;
  const search = new URL(request.url).searchParams;
  const wait = search.get("wait") === "1";

  if (!wait) {
    const count = await getUnreadNotificationsCount(user_id);
    return NextResponse.json({ count });
  }

  const cursor = Number(search.get("cursor") ?? "0");
  const since_count = Number(search.get("count") ?? "-1");
  const since_id = Number.isFinite(cursor) ? cursor : 0;
  const known_count = Number.isFinite(since_count) ? since_count : -1;

  try {
    await waitUntil({
      timeout_ms: clampLongPollTimeout(Number(search.get("timeout") ?? "")),
      signal: request.signal,
      subscribe: (wake) => subscribeNotificationUpdate(user_id, wake),
      is_ready: async () => {
        if (known_count < 0) return true;
        const snapshot = await getNotificationsLiveSnapshot(user_id, since_id);
        return snapshot.cursor !== since_id || snapshot.count !== known_count;
      },
    });
  } catch (error) {
    if (error instanceof LongPollAbortError || request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    throw error;
  }

  const snapshot = await getNotificationsLiveSnapshot(user_id, since_id);
  return NextResponse.json({
    count: snapshot.count,
    cursor: snapshot.cursor,
    items: known_count < 0 ? [] : snapshot.items,
    timed_out: snapshot.cursor === since_id && snapshot.count === known_count,
  });
}
