import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { getNotifications, markAllNotificationsRead, clearNotifications } from "@/server/repositories/devices-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const notifications = await getNotifications(100);
  return NextResponse.json({ notifications });
}

export async function PATCH() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  await markAllNotificationsRead();
  return NextResponse.json({ message: "OK" });
}

export async function DELETE() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  await clearNotifications();
  return NextResponse.json({ message: "OK" });
}
