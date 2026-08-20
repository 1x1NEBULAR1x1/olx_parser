import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import {
  getUserNotifications,
  markAllNotificationsRead,
  clearUserNotifications,
} from "@/server/repositories/user-notifications-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const notifications = await getUserNotifications(auth_result.user.id, 100);
  return NextResponse.json({ notifications });
}

export async function PATCH() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  await markAllNotificationsRead(auth_result.user.id);
  return NextResponse.json({ message: "OK" });
}

export async function DELETE() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  await clearUserNotifications(auth_result.user.id);
  return NextResponse.json({ message: "OK" });
}
