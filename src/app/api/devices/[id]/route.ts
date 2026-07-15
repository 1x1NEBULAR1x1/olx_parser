import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { getDeviceById } from "@/server/repositories/devices-repository";
import { getUserListingIds } from "@/server/repositories/user-listings-repository";
import { getUserDisplaySettings } from "@/server/repositories/user-display-settings-repository";

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
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const listing_ids = await getUserListingIds(auth_result.user.id);
  const display_settings = await getUserDisplaySettings(auth_result.user.id);
  const device = await getDeviceById(device_id, {
    favorite_ids: new Set(listing_ids.favorite_ids),
    hidden_ids: new Set(listing_ids.hidden_ids),
  }, display_settings);

  if (!device) {
    return NextResponse.json({ error: "Устройство не найдено" }, { status: 404 });
  }

  return NextResponse.json(device);
}
