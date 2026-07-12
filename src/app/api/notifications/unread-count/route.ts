import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth-guards";
import { getUnreadNotificationsCount } from "@/server/devices-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const count = await getUnreadNotificationsCount();
  return NextResponse.json({ count });
}
