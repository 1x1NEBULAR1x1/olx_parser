import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { deleteUserPushSubscription } from "@/server/repositories/push-subscriptions-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UnsubscribeBody {
  endpoint?: unknown;
}

export async function POST(request: Request) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const body = (await request.json().catch(() => null)) as UnsubscribeBody | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  await deleteUserPushSubscription(auth_result.user.id, endpoint);
  return NextResponse.json({ message: "OK" });
}
