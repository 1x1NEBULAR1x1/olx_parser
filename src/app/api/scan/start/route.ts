import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/auth-guards";
import { isScanningEffective, triggerScan } from "@/server/scan-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth_result = await requireAdminUser();
  if ("response" in auth_result) return auth_result.response;

  if (await isScanningEffective()) {
    return NextResponse.json(
      { error: "Сканирование уже запущено", is_scanning: true },
      { status: 409 },
    );
  }

  void triggerScan();

  return NextResponse.json({
    message: "Сканирование запущено",
    scan_started_at: new Date().toISOString(),
  });
}
