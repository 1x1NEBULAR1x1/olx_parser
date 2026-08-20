import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { getWebPushPublicKey, isWebPushConfigured } from "@/server/domain/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  return NextResponse.json({
    configured: isWebPushConfigured(),
    public_key: getWebPushPublicKey(),
  });
}
