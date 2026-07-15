import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { getScanCooldownRemainingSec, isScanningEffective, triggerScan } from "@/server/scan/scan-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  if (await isScanningEffective()) {
    return NextResponse.json(
      { error: "Сканирование уже запущено", is_scanning: true },
      { status: 409 },
    );
  }

  const cooldown_sec = getScanCooldownRemainingSec();
  if (cooldown_sec > 0) {
    return NextResponse.json(
      {
        error: `Подождите ${cooldown_sec} с перед повторным сканом (защита от блокировки OLX)`,
        cooldown_sec,
      },
      { status: 429 },
    );
  }

  void triggerScan();

  return NextResponse.json({
    message: "Сканирование запущено",
    scan_started_at: new Date().toISOString(),
  });
}
