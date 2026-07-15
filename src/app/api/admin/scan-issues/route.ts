import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth/auth-guards";
import { getScanIssuesPage } from "@/server/repositories/scan-issues-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  const { searchParams } = request.nextUrl;
  const scan_id = searchParams.get("scan_id");
  if (!scan_id) {
    return NextResponse.json({ error: "scan_id is required" }, { status: 400 });
  }

  const severity_param = searchParams.get("severity");
  const severity = severity_param === "error" || severity_param === "warning"
    ? severity_param
    : undefined;

  const offset = parsePositiveInt(searchParams.get("offset"), 0);
  const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 50), 200);

  const page = await getScanIssuesPage({ scan_id, severity, offset, limit });
  return NextResponse.json(page);
}
