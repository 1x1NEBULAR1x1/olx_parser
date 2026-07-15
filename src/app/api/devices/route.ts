import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { getLatestDevicesPage } from "@/server/repositories/devices-repository";
import { getScanStatus } from "@/server/scan/scan-manager";
import { getUserListingIds } from "@/server/repositories/user-listings-repository";
import { getUserDisplaySettings } from "@/server/repositories/user-display-settings-repository";
import type { DevicesListResponse } from "@/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseBooleanFlag(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function GET(request: NextRequest) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const { searchParams } = request.nextUrl;
  const offset = parsePositiveInt(searchParams.get("offset"), 0);
  const requested_limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.min(Math.max(requested_limit, 1), MAX_LIMIT);
  const include_meta = searchParams.get("meta") === "1";
  const favorites_only = parseBooleanFlag(searchParams.get("favorites_only"));
  const include_hidden = parseBooleanFlag(searchParams.get("include_hidden"));

  const listing_ids = await getUserListingIds(auth_result.user.id);
  const display_settings = await getUserDisplaySettings(auth_result.user.id);

  const [page, scan_status] = await Promise.all([
    getLatestDevicesPage(offset, limit, include_meta, {
      hidden_device_ids: listing_ids.hidden_ids,
      favorite_device_ids: listing_ids.favorite_ids,
      favorites_only,
      include_hidden,
      display_settings,
    }),
    getScanStatus(),
  ]);

  const response: DevicesListResponse = {
    devices: page.devices,
    total_count: page.total_count,
    offset: page.offset,
    limit: page.limit,
    has_more: page.has_more,
    filter_meta: page.filter_meta,
    cached_at: page.cached_at,
    is_scanning: scan_status.is_scanning,
    stage: scan_status.stage as DevicesListResponse["stage"],
    total_listings: scan_status.total_listings,
    processed_listings: scan_status.processed_listings,
    percent: scan_status.percent,
    issues_count: scan_status.issues_count,
    warnings_count: scan_status.warnings_count,
    last_scan_id: scan_status.last_scan_id,
    favorite_ids: listing_ids.favorite_ids,
    hidden_ids: listing_ids.hidden_ids,
  };

  return NextResponse.json(response);
}
