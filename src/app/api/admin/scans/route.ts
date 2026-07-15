import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { getRecentScanRuns } from "@/server/repositories/scan-issues-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const scans = await getRecentScanRuns(30);
  return NextResponse.json({ scans });
}
