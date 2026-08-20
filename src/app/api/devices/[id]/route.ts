import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { loadDeviceDetail } from "@/server/domain/feed-loader";
import { jsonError } from "@/server/shared/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const { id } = await params;
  const device_id = Number(id);

  if (Number.isNaN(device_id)) {
    return jsonError("Некорректный id", 400, "bad_request");
  }

  try {
    const result = await loadDeviceDetail(device_id);
    if (!result) {
      return jsonError("Устройство не найдено", 404, "not_found");
    }
    return NextResponse.json(result);
  } catch {
    return jsonError("Не удалось загрузить объявление.", 503, "server");
  }
}
