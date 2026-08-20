import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/server/auth/auth-guards";
import { getAppSettings, updateAppSettings, type AppSettingsData } from "@/server/repositories/devices-repository";
import {
  getUserDisplaySettings,
  updateUserDisplaySettings,
  type UserDisplaySettingsData,
} from "@/server/repositories/user-display-settings-repository";
import { rescheduleAutoScan } from "@/server/scan/scan-scheduler";
import { rescheduleCatalogAutoEnrich } from "@/server/catalog/catalog-enrich-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_AUTO_SCAN_INTERVALS = [0, 15, 30, 60, 180, 360];
const VALID_CATALOG_AUTO_ENRICH_INTERVALS = [0, 60, 180, 360, 720, 1440];
const MIN_CACHE_TTL_HOURS = 6;
const MAX_CACHE_TTL_HOURS = 2160; // ~3 месяца

interface SettingsPatchBody {
  battery_health_threshold_percent?: unknown;
  exclude_junk_listings?: unknown;
  junk_min_release_year?: unknown;
  exclude_iphone?: unknown;
  exclude_android?: unknown;
  exclude_unprofitable?: unknown;
  min_profit_pln?: unknown;
  min_profit_pct_of_price?: unknown;
  auto_scan_interval_minutes?: unknown;
  cache_ttl_hours?: unknown;
  shipping_parts_pln?: unknown;
  shipping_to_repair_pln?: unknown;
  shipping_to_customer_pln?: unknown;
  repair_labor_base_pln?: unknown;
  subscription_basic_pln?: unknown;
  subscription_pro_pln?: unknown;
  allegro_parts_auto_enabled?: unknown;
  catalog_auto_enrich_interval_minutes?: unknown;
  catalog_antibot_wait_seconds?: unknown;
  catalog_antibot_retries?: unknown;
  catalog_source_delay_ms?: unknown;
}

const MIN_LOGISTICS_PLN = 0;
const MAX_LOGISTICS_PLN = 500;
const MAX_SUBSCRIPTION_PLN = 999;

function parseLogisticsPln(value: unknown, field: string): number | NextResponse {
  if (typeof value !== "number") {
    return NextResponse.json({ error: `${field} must be a number` }, { status: 400 });
  }
  const rounded = Math.round(value * 100) / 100;
  if (rounded < MIN_LOGISTICS_PLN || rounded > MAX_LOGISTICS_PLN) {
    return NextResponse.json({ error: `${field} must be between ${MIN_LOGISTICS_PLN} and ${MAX_LOGISTICS_PLN}` }, { status: 400 });
  }
  return rounded;
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

  if (body.exclude_unprofitable !== undefined) {
    if (typeof body.exclude_unprofitable !== "boolean") {
      return NextResponse.json({ error: "exclude_unprofitable must be a boolean" }, { status: 400 });
    }
    display_patch.exclude_unprofitable = body.exclude_unprofitable;
  }

  if (body.min_profit_pln !== undefined) {
    if (typeof body.min_profit_pln !== "number") {
      return NextResponse.json({ error: "min_profit_pln must be a number" }, { status: 400 });
    }
    const amount = Math.round(body.min_profit_pln * 100) / 100;
    if (amount < 0 || amount > 5000) {
      return NextResponse.json({ error: "min_profit_pln must be between 0 and 5000" }, { status: 400 });
    }
    display_patch.min_profit_pln = amount;
  }

  if (body.min_profit_pct_of_price !== undefined) {
    if (typeof body.min_profit_pct_of_price !== "number") {
      return NextResponse.json({ error: "min_profit_pct_of_price must be a number" }, { status: 400 });
    }
    const percent = Math.round(body.min_profit_pct_of_price * 10) / 10;
    if (percent < 0 || percent > 100) {
      return NextResponse.json({ error: "min_profit_pct_of_price must be between 0 and 100" }, { status: 400 });
    }
    display_patch.min_profit_pct_of_price = percent;
  }

  if (body.battery_health_threshold_percent !== undefined) {
    if (typeof body.battery_health_threshold_percent !== "number") {
      return NextResponse.json({ error: "battery_health_threshold_percent must be a number" }, { status: 400 });
    }
    const percent = Math.round(body.battery_health_threshold_percent);
    if (percent < 0 || percent > 100) {
      return NextResponse.json({ error: "battery_health_threshold_percent must be between 0 and 100" }, { status: 400 });
    }
    display_patch.battery_health_threshold_percent = percent;
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

  const logistics_fields = [
    ["shipping_parts_pln", body.shipping_parts_pln],
    ["shipping_to_repair_pln", body.shipping_to_repair_pln],
    ["shipping_to_customer_pln", body.shipping_to_customer_pln],
    ["repair_labor_base_pln", body.repair_labor_base_pln],
  ] as const;

  for (const [field, value] of logistics_fields) {
    if (value === undefined) continue;
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const parsed = parseLogisticsPln(value, field);
    if (parsed instanceof NextResponse) return parsed;
    admin_patch[field] = parsed;
  }

  const subscription_fields = [
    ["subscription_basic_pln", body.subscription_basic_pln],
    ["subscription_pro_pln", body.subscription_pro_pln],
  ] as const;

  for (const [field, value] of subscription_fields) {
    if (value === undefined) continue;
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (typeof value !== "number") {
      return NextResponse.json({ error: `${field} must be a number` }, { status: 400 });
    }
    const rounded = Math.round(value * 100) / 100;
    if (rounded < 0 || rounded > MAX_SUBSCRIPTION_PLN) {
      return NextResponse.json({ error: `${field} must be between 0 and ${MAX_SUBSCRIPTION_PLN}` }, { status: 400 });
    }
    admin_patch[field] = rounded;
  }

  if (body.allegro_parts_auto_enabled !== undefined) {
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (typeof body.allegro_parts_auto_enabled !== "boolean") {
      return NextResponse.json({ error: "allegro_parts_auto_enabled must be a boolean" }, { status: 400 });
    }
    admin_patch.allegro_parts_auto_enabled = body.allegro_parts_auto_enabled;
  }

  if (body.catalog_auto_enrich_interval_minutes !== undefined) {
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (
      typeof body.catalog_auto_enrich_interval_minutes !== "number"
      || !VALID_CATALOG_AUTO_ENRICH_INTERVALS.includes(body.catalog_auto_enrich_interval_minutes)
    ) {
      return NextResponse.json({
        error: "catalog_auto_enrich_interval_minutes must be one of 0, 60, 180, 360, 720, 1440",
      }, { status: 400 });
    }
    admin_patch.catalog_auto_enrich_interval_minutes = body.catalog_auto_enrich_interval_minutes;
  }

  if (body.catalog_antibot_wait_seconds !== undefined) {
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (typeof body.catalog_antibot_wait_seconds !== "number") {
      return NextResponse.json({ error: "catalog_antibot_wait_seconds must be a number" }, { status: 400 });
    }
    const seconds = Math.round(body.catalog_antibot_wait_seconds);
    if (seconds < 10 || seconds > 180) {
      return NextResponse.json({ error: "catalog_antibot_wait_seconds must be between 10 and 180" }, { status: 400 });
    }
    admin_patch.catalog_antibot_wait_seconds = seconds;
  }

  if (body.catalog_antibot_retries !== undefined) {
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (typeof body.catalog_antibot_retries !== "number") {
      return NextResponse.json({ error: "catalog_antibot_retries must be a number" }, { status: 400 });
    }
    const retries = Math.round(body.catalog_antibot_retries);
    if (retries < 0 || retries > 5) {
      return NextResponse.json({ error: "catalog_antibot_retries must be between 0 and 5" }, { status: 400 });
    }
    admin_patch.catalog_antibot_retries = retries;
  }

  if (body.catalog_source_delay_ms !== undefined) {
    if (!is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    if (typeof body.catalog_source_delay_ms !== "number") {
      return NextResponse.json({ error: "catalog_source_delay_ms must be a number" }, { status: 400 });
    }
    const delay_ms = Math.round(body.catalog_source_delay_ms);
    if (delay_ms < 100 || delay_ms > 3000) {
      return NextResponse.json({ error: "catalog_source_delay_ms must be between 100 and 3000" }, { status: 400 });
    }
    admin_patch.catalog_source_delay_ms = delay_ms;
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
  if (admin_patch.catalog_auto_enrich_interval_minutes !== undefined) {
    rescheduleCatalogAutoEnrich(admin_patch.catalog_auto_enrich_interval_minutes);
  }

  return NextResponse.json({
    ...app_settings,
    ...display_settings,
    is_admin,
  });
}
