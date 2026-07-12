import { NextResponse } from "next/server";
import { requireAdminUser, requireApprovedUser } from "@/server/auth-guards";
import { getAppSettings, updateAppSettings, type AppSettingsData } from "@/server/devices-repository";
import {
  getUserDisplaySettings,
  updateUserDisplaySettings,
  type UserDisplaySettingsData,
} from "@/server/user-display-settings-repository";
import { rescheduleAutoScan } from "@/server/scan-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_AUTO_SCAN_INTERVALS = [0, 15, 30, 60, 180, 360];
const MIN_CACHE_TTL_HOURS = 6;
const MAX_CACHE_TTL_HOURS = 2160; // ~3 месяца

interface SettingsPatchBody {
  battery_health_threshold_percent?: unknown;
  exclude_junk_listings?: unknown;
  junk_min_release_year?: unknown;
  exclude_iphone?: unknown;
  exclude_android?: unknown;
  auto_scan_interval_minutes?: unknown;
  cache_ttl_hours?: unknown;
}

export async function GET() {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const [app_settings, display_settings] = await Promise.all([
    getAppSettings(),
    getUserDisplaySettings(auth_result.user.id),
  ]);

  return NextResponse.json({
    ...app_settings,
    ...display_settings,
    is_admin: auth_result.user.role === "admin",
  });
}

export async function PATCH(request: Request) {
  const auth_result = await requireApprovedUser();
  if ("response" in auth_result) return auth_result.response;

  const body = (await request.json().catch(() => null)) as SettingsPatchBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const is_admin = auth_result.user.role === "admin";
  const display_patch: Partial<UserDisplaySettingsData> = {};
  const admin_patch: Partial<AppSettingsData> = {};

  if (body.exclude_junk_listings !== undefined) {
    if (typeof body.exclude_junk_listings !== "boolean") {
      return NextResponse.json({ error: "exclude_junk_listings must be a boolean" }, { status: 400 });
    }
    display_patch.exclude_junk_listings = body.exclude_junk_listings;
  }

  if (body.junk_min_release_year !== undefined) {
    if (typeof body.junk_min_release_year !== "number") {
      return NextResponse.json({ error: "junk_min_release_year must be a number" }, { status: 400 });
    }
    const year = Math.round(body.junk_min_release_year);
    if (year < 2000 || year > new Date().getFullYear()) {
      return NextResponse.json({ error: "junk_min_release_year is out of range" }, { status: 400 });
    }
    display_patch.junk_min_release_year = year;
  }

  if (body.exclude_iphone !== undefined) {
    if (typeof body.exclude_iphone !== "boolean") {
      return NextResponse.json({ error: "exclude_iphone must be a boolean" }, { status: 400 });
    }
    display_patch.exclude_iphone = body.exclude_iphone;
  }

  if (body.exclude_android !== undefined) {
    if (typeof body.exclude_android !== "boolean") {
      return NextResponse.json({ error: "exclude_android must be a boolean" }, { status: 400 });
    }
    display_patch.exclude_android = body.exclude_android;
  }

  if (body.battery_health_threshold_percent !== undefined) {
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (typeof body.battery_health_threshold_percent !== "number") {
      return NextResponse.json({ error: "battery_health_threshold_percent must be a number" }, { status: 400 });
    }
    const percent = Math.round(body.battery_health_threshold_percent);
    if (percent < 0 || percent > 100) {
      return NextResponse.json({ error: "battery_health_threshold_percent must be between 0 and 100" }, { status: 400 });
    }
    admin_patch.battery_health_threshold_percent = percent;
  }

  if (body.auto_scan_interval_minutes !== undefined) {
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (typeof body.auto_scan_interval_minutes !== "number" || !VALID_AUTO_SCAN_INTERVALS.includes(body.auto_scan_interval_minutes)) {
      return NextResponse.json({ error: "auto_scan_interval_minutes must be one of 0, 15, 30, 60, 180, 360" }, { status: 400 });
    }
    admin_patch.auto_scan_interval_minutes = body.auto_scan_interval_minutes;
  }

  if (body.cache_ttl_hours !== undefined) {
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (typeof body.cache_ttl_hours !== "number") {
      return NextResponse.json({ error: "cache_ttl_hours must be a number" }, { status: 400 });
    }
    const hours = Math.round(body.cache_ttl_hours);
    if (hours < MIN_CACHE_TTL_HOURS || hours > MAX_CACHE_TTL_HOURS) {
      return NextResponse.json({ error: `cache_ttl_hours must be between ${MIN_CACHE_TTL_HOURS} and ${MAX_CACHE_TTL_HOURS}` }, { status: 400 });
    }
    admin_patch.cache_ttl_hours = hours;
  }

  if (Object.keys(display_patch).length === 0 && Object.keys(admin_patch).length === 0) {
    return NextResponse.json({ error: "No known settings fields provided" }, { status: 400 });
  }

  const [display_settings, app_settings] = await Promise.all([
    Object.keys(display_patch).length > 0
      ? updateUserDisplaySettings(auth_result.user.id, display_patch)
      : getUserDisplaySettings(auth_result.user.id),
    Object.keys(admin_patch).length > 0
      ? updateAppSettings(admin_patch)
      : getAppSettings(),
  ]);

  if (admin_patch.auto_scan_interval_minutes !== undefined) {
    rescheduleAutoScan(admin_patch.auto_scan_interval_minutes);
  }

  return NextResponse.json({
    ...app_settings,
    ...display_settings,
    is_admin,
  });
}
