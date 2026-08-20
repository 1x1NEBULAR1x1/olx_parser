import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { upsertPushSubscription } from "@/server/repositories/push-subscriptions-repository";
import { isWebPushConfigured } from "@/server/domain/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubscribeBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export async function POST(request: Request) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: "Web Push is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as SubscribeBody | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "endpoint and keys required" }, { status: 400 });
  }

  await upsertPushSubscription({
    user_id: auth_result.user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "OK" });
}
