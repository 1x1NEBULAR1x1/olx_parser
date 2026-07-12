import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth-guards";
import { getScanStatus } from "@/server/scan-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const status = await getScanStatus();
  return NextResponse.json(status);
}
