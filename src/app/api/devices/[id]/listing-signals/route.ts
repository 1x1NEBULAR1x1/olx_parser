import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { extractOlxListingSignals } from "@/server/fetchers/olx-fetcher/fix-parser";
import {
  getDeviceById,
  updateDeviceListingSignals,
} from "@/server/repositories/devices-repository";
import { resolveEmptyDescriptionIssues } from "@/server/repositories/scan-issues-repository";
import { getUserListingIds } from "@/server/repositories/user-listings-repository";
import { getUserDisplaySettings } from "@/server/repositories/user-display-settings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const { id } = await context.params;
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

  const signals = await extractOlxListingSignals({
    id: device.id,
    title: device.title,
    url: device.olx_url,
    created_at: device.created_at,
    city: device.city,
    region: device.region,
    price_value: device.price_buy,
    price_currency: device.price_currency,
    is_negotiable: device.is_negotiable,
    photos: device.photos,
  });

  const has_new_data = Boolean(signals.post_summary.trim() || signals.seller_name);
  if (!has_new_data) {
    return NextResponse.json({ device });
  }

  await updateDeviceListingSignals(device.id, {
    post_summary: signals.post_summary || device.post_summary,
    seller_name: signals.seller_name ?? device.seller_name,
    seller_ads_count: signals.seller_ads_count ?? device.seller_ads_count,
    seller_member_since: signals.seller_member_since ?? device.seller_member_since,
    damage_types: signals.damage_types.length > 0 ? signals.damage_types : device.damage_types,
    has_box: signals.has_box || device.has_box,
    battery_health_percent: signals.battery_health_percent ?? device.battery_health_percent,
  });
  if (signals.post_summary.trim()) {
    await resolveEmptyDescriptionIssues(device.id);
  }

  const updated = await getDeviceById(device_id, {
    favorite_ids: new Set(listing_ids.favorite_ids),
    hidden_ids: new Set(listing_ids.hidden_ids),
  }, display_settings);

  return NextResponse.json({ device: updated });
}
