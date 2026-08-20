import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { prisma } from "@/shared/db/client";
import { sendTestNotification } from "@/server/domain/notifier";
import { config } from "@/server/shared/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestNotificationBody {
  user_id?: unknown;
  send_telegram?: unknown;
}

export async function POST(request: Request) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const body = (await request.json().catch(() => null)) as TestNotificationBody | null;
  if (!body || typeof body.user_id !== "string" || body.user_id.length === 0) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const send_telegram = body.send_telegram === true;
  const user = await prisma.user.findUnique({
    where: { id: body.user_id },
    select: { id: true, email: true, is_approved: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.is_approved) {
    return NextResponse.json({ error: "User is not approved" }, { status: 400 });
  }

  const result = await sendTestNotification({
    user_id: user.id,
    send_telegram,
  });

  return NextResponse.json({
    ...result,
    user_email: user.email,
    telegram_configured: Boolean(config.telegram.bot_token && config.telegram.chat_id),
  });
}
