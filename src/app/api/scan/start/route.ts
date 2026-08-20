import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { jsonError } from "@/server/shared/api-response";
import { getScanCooldownRemainingSec, isScanningEffective, triggerScan } from "@/server/scan/scan-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  if (await isScanningEffective()) {
    return jsonError("Сканирование уже запущено", 409, "scan_busy", { is_scanning: true });
  }

  const cooldown_sec = getScanCooldownRemainingSec();
  if (cooldown_sec > 0) {
    return jsonError(
      `Подождите ${cooldown_sec} с перед повторным сканом (защита от блокировки OLX)`,
      429,
      "scan_cooldown",
      { cooldown_sec },
    );
  }

  void triggerScan();

  return NextResponse.json({
    message: "Сканирование запущено",
    scan_started_at: new Date().toISOString(),
  });
}
